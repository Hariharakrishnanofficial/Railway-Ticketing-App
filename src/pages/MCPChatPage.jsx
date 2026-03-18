/**
 * MCPChatPage — MCP-Based Database Query Assistant
 *
 * Converts natural language to structured MCP queries via Qwen,
 * executes them against Zoho Creator, and displays real database records.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { aiApi, getCurrentUser } from "../services/api";

/* ═══════════════════════════════════════════════════
   SYSTEM PROMPT — MCP Database Query Assistant
═══════════════════════════════════════════════════ */
const SYSTEM_PROMPT = `You are an MCP-based database query assistant for a Railway Ticketing System on Zoho Creator.

Your role is to:
- Understand the user request
- Generate a structured JSON query to fetch data from the database
- Return ONLY the JSON output — no explanation, no markdown fences

STRICT RULES:
1. Do NOT generate general knowledge or pre-trained model answers
2. Do NOT assume or hallucinate any data
3. Always output ONLY valid JSON — no extra text before or after
4. If the request is a greeting or general chat, respond with plain text (no JSON)
5. For database queries, output ONLY the JSON object

Output format for database queries:
{"method":"GET","module":"<module_name>","filters":{"<field_name>":"<value>"}}

Available modules and their fields:

**Stations** — Station_Code, Station_Name, City, State, Zone, Division, Station_Type
**Trains** — Train_Number, Train_Name, Train_Type, From_Station, To_Station, Departure_Time, Arrival_Time, Fare_SL, Fare_3A, Fare_2A, Fare_1A, Run_Days, Is_Active
**Bookings** — PNR, Journey_Date, Class, Booking_Status, Total_Fare, Payment_Status, Num_Passengers, Booking_Time
**Users** — Full_Name, Email, Phone_Number, Role, Account_Status, Gender
**Fares** — Class, Base_Fare, Dynamic_Fare, Tatkal_Fare, Distance_KM
**Passengers** — Passenger_Name, Age, Gender, Current_Status, Coach, Seat_Number
**Train_Routes** — Route_Name
**Route_Stops** — Station_Name, Station_Code, Sequence, Arrival_Time, Departure_Time, Distance_KM
**Inventory** — Journey_Date, Class, Total_Capacity, RAC_Count, Waitlist_Count
**Quotas** — Quota_Code, Quota_Name, Quota_Type, Booking_Open_Days, Surcharge_Percentage
**Coach_Layouts** — Coach_Number, Coach_Type, Total_Seats, Is_AC
**Announcements** — Title, Message, Type, Priority, Is_Active

Filter rules:
- For station searches, use Station_Name or Station_Code or City
- For train searches between cities, use From_Station and To_Station with city names
- For specific train lookup, use Train_Number
- For booking lookup, use PNR
- For user lookup, use Email or Phone_Number
- Use {} empty filters to get all records from a module
- Only use GET method

Examples:

User: "Show all stations"
{"method":"GET","module":"Stations","filters":{}}

User: "Find trains from Chennai to Mumbai"
{"method":"GET","module":"Trains","filters":{"From_Station":"Chennai","To_Station":"Mumbai"}}

User: "Show train 12627"
{"method":"GET","module":"Trains","filters":{"Train_Number":"12627"}}

User: "Check booking PNR PNRX7K2P9W1"
{"method":"GET","module":"Bookings","filters":{"PNR":"PNRX7K2P9W1"}}

User: "Show stations in Tamil Nadu"
{"method":"GET","module":"Stations","filters":{"State":"Tamil Nadu"}}

User: "Show all active announcements"
{"method":"GET","module":"Announcements","filters":{"Is_Active":"true"}}`;

/* ═══════════════════════════════════════════════════
   QUICK ACTIONS
═══════════════════════════════════════════════════ */
const QUICK_ACTIONS = [
  { icon: "\u{1F3E0}", label: "All Stations",   prompt: "Show all stations" },
  { icon: "\u{1F682}", label: "Find Trains",    prompt: "Find trains from Chennai to Mumbai" },
  { icon: "\u{1F4CB}", label: "All Bookings",   prompt: "Show all bookings" },
  { icon: "\u{1F4E2}", label: "Announcements",  prompt: "Show all active announcements" },
  { icon: "\u{1F464}", label: "All Users",      prompt: "Show all users" },
  { icon: "\u{1F4CA}", label: "Quotas",         prompt: "Show all quotas" },
];

/* ═══════════════════════════════════════════════════
   MODULE DISPLAY CONFIG — which fields to show per module
═══════════════════════════════════════════════════ */
const MODULE_DISPLAY = {
  Stations:      ["Station_Code", "Station_Name", "City", "State", "Zone"],
  Trains:        ["Train_Number", "Train_Name", "From_Station", "To_Station", "Departure_Time", "Arrival_Time", "Fare_SL", "Fare_3A", "Fare_2A"],
  Bookings:      ["PNR", "Trains", "Journey_Date", "Class", "Booking_Status", "Total_Fare", "Num_Passengers"],
  Users:         ["Full_Name", "Email", "Phone_Number", "Role", "Account_Status"],
  Fares:         ["Train", "From_Station", "To_Station", "Class", "Base_Fare", "Dynamic_Fare"],
  Passengers:    ["Passenger_Name", "Age", "Gender", "Current_Status", "Coach", "Seat_Number"],
  Train_Routes:  ["Trains", "Route_Name"],
  Route_Stops:   ["Station_Name", "Station_Code", "Sequence", "Arrival_Time", "Departure_Time", "Distance_KM"],
  Inventory:     ["Train", "Journey_Date", "Class", "Total_Capacity", "RAC_Count", "Waitlist_Count"],
  Quotas:        ["Quota_Code", "Quota_Name", "Quota_Type", "Booking_Open_Days", "Surcharge_Percentage"],
  Coach_Layouts: ["Coach_Number", "Coach_Type", "Total_Seats", "Is_AC", "Train"],
  Announcements: ["Title", "Message", "Type", "Priority", "Is_Active"],
};

/* ═══════════════════════════════════════════════════
   HELPER — Extract display value from Zoho fields
═══════════════════════════════════════════════════ */
function displayValue(val) {
  if (val == null) return "—";
  if (typeof val === "object") return val.display_value || val.ID || JSON.stringify(val);
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

/* ═══════════════════════════════════════════════════
   HELPER — Try to parse MCP JSON from Qwen response
═══════════════════════════════════════════════════ */
function parseMcpJson(text) {
  if (!text) return null;
  // Try direct parse
  try {
    const obj = JSON.parse(text.trim());
    if (obj.method && obj.module) return obj;
  } catch {}
  // Try extracting JSON from markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const obj = JSON.parse(fenceMatch[1].trim());
      if (obj.method && obj.module) return obj;
    } catch {}
  }
  // Try finding JSON object in text
  const braceMatch = text.match(/\{[\s\S]*"method"[\s\S]*"module"[\s\S]*\}/);
  if (braceMatch) {
    try {
      const obj = JSON.parse(braceMatch[0]);
      if (obj.method && obj.module) return obj;
    } catch {}
  }
  return null;
}

/* ═══════════════════════════════════════════════════
   COMPONENT — MCP Query Badge (shows the generated query)
═══════════════════════════════════════════════════ */
function McpQueryBadge({ mcpJson }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "rgba(6, 182, 212, 0.1)", border: "1px solid rgba(6, 182, 212, 0.3)",
          color: "#06b6d4", borderRadius: 6, padding: "4px 10px", fontSize: 11,
          cursor: "pointer", fontFamily: "var(--font-mono)", display: "flex",
          alignItems: "center", gap: 6,
        }}
      >
        <span style={{ fontSize: 13 }}>{expanded ? "\u25BC" : "\u25B6"}</span>
        MCP Query: {mcpJson.module}
        {Object.keys(mcpJson.filters || {}).length > 0 &&
          ` \u2022 ${Object.keys(mcpJson.filters).length} filter(s)`}
      </button>
      {expanded && (
        <pre style={{
          background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: 10, marginTop: 6,
          fontSize: 11, color: "#06b6d4", overflow: "auto", maxHeight: 120,
          fontFamily: "var(--font-mono)", border: "1px solid rgba(6, 182, 212, 0.2)",
        }}>
          {JSON.stringify(mcpJson, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   COMPONENT — Database Results Table
═══════════════════════════════════════════════════ */
function ResultsDisplay({ records, module, count }) {
  const fields = MODULE_DISPLAY[module] || Object.keys(records[0] || {}).filter(k => k !== "ID" && !k.startsWith("zc_"));

  if (count === 0) {
    return (
      <div style={{ color: "var(--text-muted)", fontStyle: "italic", padding: "8px 0" }}>
        No records found in {module}.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
        Found <strong style={{ color: "var(--accent-amber)" }}>{count}</strong> record{count !== 1 ? "s" : ""} in <strong>{module}</strong>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 400 }}>
        <table style={{
          width: "100%", borderCollapse: "collapse", fontSize: 12,
          fontFamily: "var(--font-mono)",
        }}>
          <thead>
            <tr>
              {fields.map(f => (
                <th key={f} style={{
                  textAlign: "left", padding: "6px 10px", borderBottom: "1px solid var(--border)",
                  color: "var(--accent-amber)", fontWeight: 600, whiteSpace: "nowrap",
                  fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5,
                }}>
                  {f.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.slice(0, 50).map((rec, i) => (
              <tr key={rec.ID || i} style={{
                background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
              }}>
                {fields.map(f => (
                  <td key={f} style={{
                    padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                    color: "var(--text-primary)", whiteSpace: "nowrap", maxWidth: 200,
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {displayValue(rec[f])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {count > 50 && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
          Showing first 50 of {count} records.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TEXT RENDERER — Markdown-lite formatting
═══════════════════════════════════════════════════ */
function RenderText({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div style={{ lineHeight: 1.65 }}>
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <span key={i}>
            {parts.map((p, j) => {
              if (p.startsWith("**") && p.endsWith("**"))
                return <strong key={j} style={{ color: "var(--accent-amber)", fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
              if (p.startsWith("`") && p.endsWith("`"))
                return (
                  <code key={j} style={{
                    fontFamily: "var(--font-mono)", background: "rgba(245, 158, 11, 0.12)",
                    color: "var(--accent-amber)", padding: "2px 6px", borderRadius: 4, fontSize: "0.88em",
                    border: "1px solid rgba(245, 158, 11, 0.2)"
                  }}>{p.slice(1, -1)}</code>
                );
              return <span key={j}>{p}</span>;
            })}
            {i < lines.length - 1 && <br />}
          </span>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TYPING INDICATOR
═══════════════════════════════════════════════════ */
function TypingIndicator({ label }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)", padding: "10px 16px",
      width: "fit-content",
    }}>
      <span style={{ fontSize: 16 }}>{"\u{1F50D}"}</span>
      <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>
        {label || "Processing..."}
      </span>
      <span style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--accent-amber)",
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
export default function MCPChatPage({ user }) {
  const currentUser = user || getCurrentUser();

  const getInitialMessage = () => ({
    id: 0,
    role: "assistant",
    content: `**Welcome to Railway MCP Query Assistant**\n\nI convert your natural language queries into structured database queries and fetch **real data** from Zoho Creator.\n\nTry asking:\n- **"Show all stations"**\n- **"Find trains from Chennai to Mumbai"**\n- **"Check booking PNR 12345678"**\n- **"Show train 12627"**\n\nUse the quick actions below or type your query!`,
  });

  const [messages, setMessages] = useState([getInitialMessage()]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const historyRef = useRef([]);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // ── Main send handler (two-phase: Qwen → MCP Query) ──
  const handleSend = useCallback(async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setLoadingLabel("Analyzing query...");

    const userMsg = { id: Date.now(), role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);

    const apiMessages = historyRef.current.map(m => ({ role: m.role, content: m.content }));
    apiMessages.push({ role: "user", content: text });

    try {
      // ── Phase 1: Ask Qwen to generate MCP JSON ──
      const qwenResponse = await aiApi.qwen({
        system: SYSTEM_PROMPT,
        messages: apiMessages,
        max_tokens: 512,
        temperature: 0.3,
      });

      let replyText = "";
      if (qwenResponse?.success && qwenResponse.choices?.length > 0) {
        replyText = qwenResponse.choices[0].message?.content || "";
      } else if (qwenResponse?.raw_response?.response) {
        replyText = qwenResponse.raw_response.response;
      }

      if (!replyText) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1, role: "assistant",
          content: "I couldn't process your request. Please try again.",
          error: true,
        }]);
        return;
      }

      // ── Phase 2: Try to parse MCP JSON and execute query ──
      const mcpJson = parseMcpJson(replyText);

      if (mcpJson) {
        setLoadingLabel(`Querying ${mcpJson.module}...`);

        try {
          const dbResult = await aiApi.mcpQuery(mcpJson);

          if (dbResult?.success) {
            setMessages(prev => [...prev, {
              id: Date.now() + 1, role: "assistant",
              mcpJson,
              records: dbResult.records || [],
              module: dbResult.module || mcpJson.module,
              count: dbResult.count || 0,
              content: null,
            }]);

            historyRef.current = [
              ...historyRef.current,
              { role: "user", content: text },
              { role: "assistant", content: `[Returned ${dbResult.count} records from ${mcpJson.module}]` },
            ].slice(-20);
          } else {
            setMessages(prev => [...prev, {
              id: Date.now() + 1, role: "assistant",
              content: `Query failed: ${dbResult?.error || "Unknown error"}`,
              error: true,
            }]);
          }
        } catch (queryErr) {
          setMessages(prev => [...prev, {
            id: Date.now() + 1, role: "assistant",
            content: `Database query error: ${queryErr.message || "Connection failed"}`,
            error: true,
          }]);
        }
      } else {
        // Plain text response (greeting, clarification, etc.)
        setMessages(prev => [...prev, {
          id: Date.now() + 1, role: "assistant", content: replyText,
        }]);

        historyRef.current = [
          ...historyRef.current,
          { role: "user", content: text },
          { role: "assistant", content: replyText },
        ].slice(-20);
      }
    } catch (err) {
      console.error("AI Chat error:", err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: "assistant",
        content: `Connection error: ${err.message || "Please check your network and try again."}`,
        error: true,
      }]);
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }, [input, loading]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([getInitialMessage()]);
    historyRef.current = [];
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", minHeight: "calc(100vh - var(--topbar-height))",
      background: "var(--bg-base)", color: "var(--text-primary)",
      fontFamily: "var(--font-body)", fontSize: 14, overflow: "hidden"
    }}>
      {/* ── HEADER ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 60,
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, #06b6d4, #0891b2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, boxShadow: "0 0 16px rgba(6,182,212,0.3)"
          }}>{"\u{1F4BE}"}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5, color: "#06b6d4" }}>MCP Query Assistant</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleClear}
            style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", cursor: "pointer", padding: "6px 12px",
              borderRadius: "var(--radius-sm)", fontSize: 12, fontFamily: "var(--font-body)",
              transition: "all 0.15s"
            }}
            onMouseEnter={e => { e.target.style.background = "var(--bg-elevated)"; e.target.style.borderColor = "#06b6d4"; }}
            onMouseLeave={e => { e.target.style.background = "var(--bg-surface)"; e.target.style.borderColor = "var(--border)"; }}
          >{"\u21BA"} Clear</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--success)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 6px var(--success)" }} />
            LIVE
          </div>
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto",
        background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
        flexShrink: 0, scrollbarWidth: "none"
      }}>
        {QUICK_ACTIONS.map((qa) => (
          <button key={qa.label} onClick={() => !loading && handleSend(qa.prompt)} style={{
            flexShrink: 0, background: "var(--bg-elevated)", border: "1px solid var(--border)",
            color: "var(--text-secondary)", borderRadius: "var(--radius-full)", padding: "6px 14px",
            fontSize: 12, cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
            transition: "all 0.15s", opacity: loading ? 0.5 : 1, fontFamily: "var(--font-body)"
          }}
            onMouseEnter={e => { if (!loading) { e.target.style.borderColor = "#06b6d4"; e.target.style.color = "#06b6d4"; }}}
            onMouseLeave={e => { e.target.style.borderColor = "var(--border)"; e.target.style.color = "var(--text-secondary)"; }}
          >{qa.icon} {qa.label}</button>
        ))}
      </div>

      {/* ── MESSAGES ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            alignItems: "flex-end", gap: 10
          }}>
            {msg.role === "assistant" && (
              <div style={{
                width: 32, height: 32, borderRadius: "var(--radius-sm)", flexShrink: 0,
                background: "linear-gradient(135deg, #06b6d4, #0891b2)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14
              }}>{"\u{1F4BE}"}</div>
            )}
            <div style={{
              maxWidth: msg.records ? "90%" : "75%",
              background: msg.role === "user"
                ? "linear-gradient(135deg, #06b6d4, #0891b2)"
                : msg.error ? "rgba(244, 63, 94, 0.1)" : "var(--bg-elevated)",
              color: msg.role === "user" ? "#fff" : msg.error ? "var(--error)" : "var(--text-primary)",
              borderRadius: msg.role === "user"
                ? "var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)"
                : "var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)",
              padding: "12px 16px", fontSize: 13.5,
              border: msg.role === "user" ? "none" : msg.error ? "1px solid var(--error)" : "1px solid var(--border)",
              boxShadow: msg.role === "user" ? "0 2px 12px rgba(6,182,212,0.25)" : "var(--shadow-sm)"
            }}>
              {/* Database results */}
              {msg.records ? (
                <>
                  <McpQueryBadge mcpJson={msg.mcpJson} />
                  <ResultsDisplay records={msg.records} module={msg.module} count={msg.count} />
                </>
              ) : (
                <RenderText text={msg.content} />
              )}
            </div>
            {msg.role === "user" && (
              <div style={{
                width: 32, height: 32, borderRadius: "var(--radius-sm)", flexShrink: 0,
                background: "var(--bg-elevated)", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 13, color: "var(--text-secondary)",
                border: "1px solid var(--border)"
              }}>{"\u{1F464}"}</div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "var(--radius-sm)",
              background: "linear-gradient(135deg, #06b6d4, #0891b2)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14
            }}>{"\u{1F4BE}"}</div>
            <TypingIndicator label={loadingLabel} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── INPUT ── */}
      <div style={{
        padding: "12px 16px 16px",
        background: "var(--bg-surface)", borderTop: "1px solid var(--border)", flexShrink: 0
      }}>
        <div style={{
          display: "flex", gap: 10, alignItems: "flex-end",
          background: "var(--bg-elevated)", borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)", padding: "10px 10px 10px 16px",
          transition: "border-color 0.2s"
        }}
          onFocusCapture={e => e.currentTarget.style.borderColor = "#06b6d4"}
          onBlurCapture={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask a database query... e.g. 'Show all trains from Chennai'"
            rows={1}
            disabled={loading}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--text-primary)", resize: "none", fontSize: 14, lineHeight: 1.5,
              fontFamily: "var(--font-body)", minHeight: 24, maxHeight: 120,
              scrollbarWidth: "none", opacity: loading ? 0.6 : 1
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={{
              width: 40, height: 40, borderRadius: "var(--radius-sm)", border: "none",
              background: loading || !input.trim() ? "var(--bg-surface)" : "linear-gradient(135deg, #06b6d4, #0891b2)",
              color: loading || !input.trim() ? "var(--text-muted)" : "#fff",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, flexShrink: 0, transition: "all 0.15s",
              boxShadow: loading || !input.trim() ? "none" : "0 2px 10px rgba(6,182,212,0.35)"
            }}
          >{"\u27A4"}</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
          MCP Query Assistant \u00B7 Zoho Creator \u00B7 Enter to send \u00B7 Shift+Enter for new line
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
