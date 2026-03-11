from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import requests
import logging
import re
import uuid
import json
from datetime import datetime, timedelta
from functools import wraps
import hashlib
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== Configuration ====================

def to_zoho_date_only(date_str):
    """Convert 'YYYY-MM-DD' or 'DD-MMM-YYYY HH:MM:SS' → 'DD-MMM-YYYY' for Zoho date fields."""
    if not date_str:
        return None
    MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    s = str(date_str).strip()
    # Already "DD-MMM-YYYY ..." format
    if len(s) >= 11 and s[2] == '-' and s[6] == '-':
        return s.split(' ')[0]
    # "YYYY-MM-DD" format
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        try:
            yyyy, mm, dd = s[:10].split('-')
            return f"{dd.zfill(2)}-{MONTHS[int(mm)-1]}-{yyyy}"
        except Exception:
            pass
    return s


# ==================== SEAT ALLOCATION HELPERS ====================

# Maps booking Class field → Available_Seats_* field on Trains form
SEAT_CLASS_MAP = {
    'SL': 'Available_Seats_SL',
    '2S': 'Available_Seats_SL',   # shares SL pool
    '3A': 'Available_Seats_3A',
    '3AC': 'Available_Seats_3A',
    '2A': 'Available_Seats_2A',
    '2AC': 'Available_Seats_2A',
    '1A': 'Available_Seats_1A',
    '1AC': 'Available_Seats_1A',
    'CC': 'Available_Seats_CC',
    'EC': 'Available_Seats_CC',   # shares CC pool
    'FC': 'Available_Seats_1A',   # shares 1A pool
}

# Berth cycling order per class for auto-assignment
BERTH_CYCLE = {
    'SL':  ['Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper'],
    '3A':  ['Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper'],
    '2A':  ['Lower', 'Upper', 'Side Lower', 'Side Upper'],
    '1A':  ['Lower', 'Upper'],
    'CC':  ['Window', 'Aisle', 'Middle'],
    'EC':  ['Window', 'Aisle'],
    'FC':  ['Lower', 'Upper'],
}

# Coach prefix per class
COACH_PREFIX = {
    'SL': 'S', '2S': 'S',
    '3A': 'B', '3AC': 'B',
    '2A': 'A', '2AC': 'A',
    '1A': 'H', '1AC': 'H',
    'CC': 'C', 'EC': 'EC',
    'FC': 'FC',
}

# Seats per coach per class
COACH_CAPACITY = {
    'SL': 72, '2S': 100,
    '3A': 64, '3AC': 64,
    '2A': 46, '2AC': 46,
    '1A': 18, '1AC': 18,
    'CC': 78, 'EC': 56,
    'FC': 18,
}

def get_available_seats(train_id, cls):
    """
    Returns current Available_Seats for given class from Zoho.
    Falls back to computing from Total_Seats - confirmed_bookings if field missing.
    """
    train_res = zoho.get_record_by_id(zoho.forms['reports']['trains'], train_id)
    if not train_res.get('success'):
        return None, None  # (available, train_record)
    rec = train_res.get('data', {}).get('data', train_res.get('data', {}))
    
    avail_field = SEAT_CLASS_MAP.get(cls.upper(), 'Available_Seats_SL')
    available = rec.get(avail_field)

    # Zoho returns "" for unset number fields — treat "" as None
    if available is None or str(available).strip() == "":
        available = None

    # If Available_Seats field not set, compute from Total_Seats - confirmed_bookings
    if available is None:
        total_field = avail_field.replace('Available_', 'Total_')
        total_raw = rec.get(total_field)
        total = int(float(str(total_raw))) if total_raw not in (None, "") else 0

        # Count confirmed bookings for this class
        criteria = f'(Trains == "{train_id}") && (Booking_Status == "confirmed") && (Class == "{cls}")'
        bk_res = zoho.get_all_records(zoho.forms['reports']['bookings'], criteria=criteria, limit=1000)
        bookings = bk_res.get('data', {}).get('data', []) if bk_res.get('success') else []
        booked = sum(int(b.get('Passenger_Count') or 1) for b in bookings)
        available = max(0, total - booked)

    # Safe cast — Zoho may return numeric string "300" or float "300.0"
    try:
        available = int(float(str(available)))
    except (ValueError, TypeError):
        available = 0

    return available, rec

def decrement_seats(train_id, cls, count, train_rec):
    """
    Subtract `count` from Available_Seats_* for the given class.
    Called after a confirmed booking is created.
    """
    avail_field = SEAT_CLASS_MAP.get(cls.upper(), 'Available_Seats_SL')
    _raw = train_rec.get(avail_field)
    current = int(float(str(_raw))) if _raw not in (None, "", " ") else 0
    new_val = max(0, current - count)
    
    result = zoho.update_record(
        zoho.forms['reports']['trains'],
        train_id,
        {avail_field: new_val}
    )
    logger.info(f"Seat decrement: train={train_id} class={cls} {current}→{new_val} result={result.get('success')}")
    return new_val

def restore_seats(train_id, cls, count):
    """
    Add `count` back to Available_Seats_* for the given class.
    Called when a booking is cancelled.
    """
    train_res = zoho.get_record_by_id(zoho.forms['reports']['trains'], train_id)
    if not train_res.get('success'):
        logger.warning(f"restore_seats: train {train_id} not found")
        return
    rec = train_res.get('data', {}).get('data', train_res.get('data', {}))
    
    avail_field = SEAT_CLASS_MAP.get(cls.upper(), 'Available_Seats_SL')
    total_field = avail_field.replace('Available_', 'Total_')
    _avail_raw = rec.get(avail_field)
    _total_raw = rec.get(total_field)
    current = int(float(str(_avail_raw))) if _avail_raw not in (None, "", " ") else 0
    total   = int(float(str(_total_raw))) if _total_raw not in (None, "", " ") else 9999
    new_val = min(total, current + count)
    
    zoho.update_record(
        zoho.forms['reports']['trains'],
        train_id,
        {avail_field: new_val}
    )
    logger.info(f"Seat restore: train={train_id} class={cls} {current}→{new_val}")

def assign_seat_numbers(train_id, cls, journey_date, passengers, train_rec):
    """
    Auto-assigns seat/berth numbers to each passenger.
    Finds the last used seat number from existing confirmed bookings,
    then assigns the next ones sequentially with berth cycling.
    Returns list of seat strings e.g. ["S1/23/Lower", "S1/24/Middle"]
    """
    cls_upper = cls.upper()
    prefix    = COACH_PREFIX.get(cls_upper, 'S')
    cap       = COACH_CAPACITY.get(cls_upper, 72)
    berths    = BERTH_CYCLE.get(cls_upper, ['Lower', 'Middle', 'Upper'])
    
    # Find highest seat number already booked on this train/class/date
    criteria = (
        f'(Trains == "{train_id}") && '
        f'(Class == "{cls}") && '
        f'(Booking_Status == "confirmed")'
    )
    bk_res   = zoho.get_all_records(zoho.forms['reports']['bookings'], criteria=criteria, limit=1000)
    bookings = bk_res.get('data', {}).get('data', []) if bk_res.get('success') else []
    
    # Filter by journey date
    def _date_match(b):
        jd = str(b.get('Journey_Date', ''))
        try:
            if len(jd.split('-')[0]) == 4:
                return jd[:10] == journey_date
            return datetime.strptime(jd.split(' ')[0], '%d-%b-%Y').strftime('%Y-%m-%d') == journey_date
        except Exception:
            return False
    
    date_bookings = [b for b in bookings if _date_match(b)]
    
    # Parse highest seat number already used
    max_seat = 0
    for b in date_bookings:
        seat_str = b.get('Seat_Numbers', '') or ''
        for part in str(seat_str).split(','):
            part = part.strip()
            # Format: "S1/23/Lower" — extract the number
            nums = re.findall(r'/(\d+)/', part)
            if nums:
                max_seat = max(max_seat, int(nums[0]))
    
    # Assign seats to each new passenger
    assigned = []
    for i, pax in enumerate(passengers):
        seat_num   = max_seat + i + 1
        coach_num  = ((seat_num - 1) // cap) + 1
        seat_in_coach = ((seat_num - 1) % cap) + 1
        
        # Honour preference if given, else cycle
        pref = pax.get('berthPref', 'No Preference')
        if pref and pref != 'No Preference' and pref in berths:
            berth = pref
        else:
            berth = berths[(seat_num - 1) % len(berths)]
        
        coach_label = f"{prefix}{coach_num}"
        assigned.append(f"{coach_label}/{seat_in_coach}/{berth}")
    
    return assigned
def format_zoho_date(date_str):
    """
    Convert date from 'DD-MMM-YYYY HH:MM:SS' to 'YYYY-MM-DD HH:MM:SS'
    Example: '12-Mar-2026 13:08:30' -> '2026-03-12 13:08:30'
    """
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str, "%d-%b-%Y %H:%M:%S")
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        # if already in correct format, return as is
        return date_str

def extract_lookup_id(field):
    if isinstance(field, dict):
        return field.get("ID")
    return field  # assume it's already a string ID

def get_zoho_config():
    """Get Zoho Creator configuration from environment variables"""
    config = {
        'base_url': os.getenv('ZOHO_API_BASE_URL', 'https://creator.zoho.in/api/v2'),
        'account_owner': os.getenv('ZOHO_ACCOUNT_OWNER_NAME'),
        'app_name': os.getenv('ZOHO_APP_NAME', 'railway-ticketing-system'),
        'client_id': os.getenv('ZOHO_CLIENT_ID'),
        'client_secret': os.getenv('ZOHO_CLIENT_SECRET'),
        'refresh_token': os.getenv('ZOHO_REFRESH_TOKEN'),
        'token_url': os.getenv('ZOHO_TOKEN_URL', 'https://accounts.zoho.in/oauth/v2/token')
    }
    return config

def get_form_config():
    """Get form and report names from environment"""
    return {
        'forms': {
            'stations':     os.getenv('ZOHO_FORM_STATIONS',     'Stations'),
            'trains':       os.getenv('ZOHO_FORM_TRAINS',       'Trains'),
            'users':        os.getenv('ZOHO_FORM_USERS',        'Users'),
            'bookings':     os.getenv('ZOHO_FORM_BOOKINGS',     'Bookings'),
            'settings':     os.getenv('ZOHO_FORM_SETTINGS',     'Settings'),
            'fares':        os.getenv('ZOHO_FORM_FARES',        'Fares'),
            'train_routes': os.getenv('ZOHO_FORM_TRAIN_ROUTES', 'Train_Routes'),
            
        },
        'reports': {
            'stations':     os.getenv('ZOHO_REPORT_STATIONS',     'All_Stations'),
            'trains':       os.getenv('ZOHO_REPORT_TRAINS',       'All_Trains'),
            'users':        os.getenv('ZOHO_REPORT_USERS',        'All_Users'),
            'bookings':     os.getenv('ZOHO_REPORT_BOOKINGS',     'All_Bookings'),
            'settings':     os.getenv('ZOHO_REPORT_SETTINGS',     'All_Setting'),
            'fares':        os.getenv('ZOHO_REPORT_FARES',        'All_Fares'),
            'train_routes': os.getenv('ZOHO_REPORT_TRAIN_ROUTES', 'All_Train_Routes'),
        }
    }

# ==================== Zoho Token Management ====================

class ZohoTokenManager:
    """Manages OAuth token refresh for Zoho Creator API"""
    
    def __init__(self):
        self.config = get_zoho_config()
        self.access_token = None
        self.token_expires_at = None
        self.last_error = None
    
    def validate_config(self):
        """Validate that all required config is present"""
        required_fields = ['client_id', 'client_secret', 'refresh_token', 'account_owner']
        missing = [f for f in required_fields if not self.config.get(f)]
        
        if missing:
            error_msg = f"Missing required environment variables: {', '.join(missing)}"
            logger.error(error_msg)
            return False, error_msg
        return True, None
    
    def get_access_token(self):
        """Get valid access token, refresh if expired"""
        # Check config first
        is_valid, error_msg = self.validate_config()
        if not is_valid:
            self.last_error = error_msg
            raise Exception(error_msg)
        
        # Return existing token if still valid
        if self.access_token and self.token_expires_at and datetime.now() < self.token_expires_at:
            logger.debug("Using cached access token")
            return self.access_token
        
        # Refresh token
        logger.info("Refreshing Zoho access token...")
        
        payload = {
            'refresh_token': self.config['refresh_token'],
            'client_id': self.config['client_id'],
            'client_secret': self.config['client_secret'],
            'grant_type': 'refresh_token'
        }
        
        try:
            logger.debug(f"Token URL: {self.config['token_url']}")
            logger.debug(f"Client ID: {self.config['client_id'][:10]}...")
            
            response = requests.post(
                self.config['token_url'], 
                data=payload, 
                timeout=30,
                headers={'Content-Type': 'application/x-www-form-urlencoded'}
            )
            
            logger.debug(f"Token refresh response status: {response.status_code}")
            logger.debug(f"Token refresh response: {response.text[:200]}")
            
            if response.status_code != 200:
                error_data = response.json() if response.text else {}
                error_msg = error_data.get('error', 'Unknown error')
                error_desc = error_data.get('error_description', 'No description')
                raise Exception(f"Token refresh failed: {error_msg} - {error_desc}")
            
            data = response.json()
            
            if 'access_token' not in data:
                raise Exception(f"No access_token in response: {json.dumps(data)}")
            
            self.access_token = data['access_token']
            expires_in = data.get('expires_in', 3600)
            self.token_expires_at = datetime.now() + timedelta(seconds=expires_in - 300)
            
            logger.info("Zoho access token refreshed successfully")
            self.last_error = None
            return self.access_token
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Network error during token refresh: {str(e)}"
            logger.error(error_msg)
            self.last_error = error_msg
            raise Exception(error_msg)
        except Exception as e:
            error_msg = f"Token refresh error: {str(e)}"
            logger.error(error_msg)
            self.last_error = error_msg
            raise

# Global token manager
token_manager = ZohoTokenManager()

# ==================== Zoho Service ====================

class ZohoService:
    """Service layer for Zoho Creator API"""

    def __init__(self):
        self.config = get_zoho_config()
        self.forms = get_form_config()

    # ------------------------------------------------
    # AUTH HEADERS
    # ------------------------------------------------

    def _get_headers(self, force_refresh=False):
        if force_refresh:
            token_manager.access_token = None
            token_manager.token_expires_at = None

        token = token_manager.get_access_token()

        return {
            "Authorization": f"Zoho-oauthtoken {token}",
            "Content-Type": "application/json"
        }

    # ------------------------------------------------
    # URL BUILDER
    # ------------------------------------------------

    def _get_url(self, endpoint_type, name, record_id=None):

        base = f"{self.config['base_url']}/{self.config['account_owner']}/{self.config['app_name']}"

        if endpoint_type == "form":
            url = f"{base}/form/{name}"

        elif endpoint_type == "report":
            url = f"{base}/report/{name}"
            if record_id:
                url += f"/{record_id}"

        else:
            url = base

        return url

    # ------------------------------------------------
    # CENTRAL REQUEST HANDLER
    # ------------------------------------------------

    def _request(self, method, url, **kwargs):

        headers = self._get_headers()

        response = requests.request(
            method,
            url,
            headers=headers,
            timeout=30,
            **kwargs
        )

        # Retry once if token expired
        if response.status_code == 401:
            logger.warning("Token expired. Refreshing token...")

            headers = self._get_headers(force_refresh=True)

            response = requests.request(
                method,
                url,
                headers=headers,
                timeout=30,
                **kwargs
            )

        return self._handle_response(response)

    # ------------------------------------------------
    # CREATE RECORD
    # ------------------------------------------------

    def create_record(self, form_name, data):

        try:
            url = self._get_url("form", form_name)

            payload = {
                "data": [data]
            }

            return self._request(
                "POST",
                url,
                json=payload
            )

        except Exception as e:
            logger.error(str(e))
            return {"success": False, "error": str(e)}

    # ------------------------------------------------
    # GET ALL RECORDS
    # ------------------------------------------------

    def get_all_records(self, report_name, criteria=None, limit=200):
        try:
            url = self._get_url("report", report_name)
            params = {"max_records": min(limit, 1000)}   # ← fix here
            if criteria:
                params["criteria"] = criteria
            return self._request("GET", url, params=params)
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ------------------------------------------------
    # GET RECORD BY ID
    # ------------------------------------------------

    def get_record_by_id(self, report_name, record_id):

        try:
            url = self._get_url("report", report_name, record_id)

            return self._request("GET", url)

        except Exception as e:
            return {"success": False, "error": str(e)}

    # ------------------------------------------------
    # UPDATE RECORD
    # ------------------------------------------------

    def update_record(self, report_name, record_id, data):
        """
        PATCH a specific record by ID.
        Zoho Creator API v2 format (per official docs):
          { "data": { ...fields... } }
        
        For subform rows, data should be:
          { "Route_Stops": [ { "ID": "stop_id", "Halt_Minutes": 5 } ] }
          — no ID = new insert, with ID = update row, with _delete=None = delete row
        """
        try:
            url = self._get_url("report", report_name, record_id)

            payload = {"data": data}

            return self._request("PATCH", url, json=payload)

        except Exception as e:
            return {"success": False, "error": str(e)}

    # ------------------------------------------------
    # DELETE RECORD
    # ------------------------------------------------

    def delete_record(self, report_name, record_id):

        try:
            url = self._get_url("report", report_name, record_id)

            logger.info(f"Deleting record {record_id} from {report_name}")

            return self._request("DELETE", url)

        except Exception as e:
            logger.error(f"Delete error: {str(e)}")
            return {"success": False, "error": str(e)}

    # ------------------------------------------------
    # RESPONSE HANDLER
    # ------------------------------------------------


    # Aliases used in legacy fares/concessions endpoints
    def get_records(self, report_name, criteria=None, limit=200):
        """Alias for get_all_records — returns list of data rows directly."""
        result = self.get_all_records(report_name, criteria=criteria, limit=limit)
        if result.get('success'):
            return result.get('data', {}).get('data', [])
        return []

    def add_record(self, form_name, data):
        """Alias for create_record."""
        return self.create_record(form_name, data)

    def _handle_response(self, response):

        try:

            if response.status_code in [200, 201, 202]:

                return {
                    "success": True,
                    "data": response.json(),
                    "status_code": response.status_code
                }

            if response.status_code == 204:

                return {
                    "success": True,
                    "data": None,
                    "status_code": 204
                }

            try:
                error_data = response.json()
                message = error_data.get("message", response.text)

            except Exception:
                message = response.text

            return {
                "success": False,
                "error": f"HTTP {response.status_code}",
                "message": message,
                "status_code": response.status_code
            }

        except Exception as e:

            return {
                "success": False,
                "error": str(e)
            }


zoho = ZohoService()

# ==================== Validation Helpers ====================

def validate_email(email):
    """Simple email validation"""
    if not email:
        return False
    pattern = r'^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'
    return re.match(pattern, email) is not None

def validate_required(data, fields):
    """Check for missing required fields"""
    if not data:
        return False, ["No data provided"]
    missing = [f for f in fields if f not in data or data[f] is None or data[f] == ""]
    return len(missing) == 0, missing


# ==================== Routes ====================

@app.route('/')
def index():
    """Root endpoint"""
    config = get_zoho_config()
    config_status = "configured" if all([config['client_id'], config['refresh_token'], config['account_owner']]) else "missing credentials"
    
    return jsonify({
        'message': 'Railway Ticketing System API',
        'status': 'running',
        'version': '1.0.0',
        'zoho_config': config_status,
        'endpoints': {
            'health': '/api/health',
            'debug': '/api/debug/config',
            'stations': '/api/stations',
            'trains': '/api/trains',
            'users': '/api/users',
            'bookings': '/api/bookings'
        }
    })

@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    config = get_zoho_config()
    is_configured = all([config['client_id'], config['refresh_token'], config['account_owner']])
    
    health_data = {
        'status': 'healthy' if is_configured else 'misconfigured',
        'timestamp': datetime.now().isoformat(),
        'zoho_credentials_present': {
            'client_id': bool(config['client_id']),
            'client_secret': bool(config['client_secret']),
            'refresh_token': bool(config['refresh_token']),
            'account_owner': bool(config['account_owner']),
            'app_name': bool(config['app_name'])
        },
        'token_manager_error': token_manager.last_error
    }
    
    status_code = 200 if is_configured else 503
    return jsonify(health_data), status_code

@app.route('/api/debug/config')
def debug_config():
    """Debug endpoint to check configuration (hide sensitive values)"""
    config = get_zoho_config()
    
    # Mask sensitive values
    safe_config = {
        'base_url': config['base_url'],
        'account_owner': config['account_owner'],
        'app_name': config['app_name'],
        'client_id': f"{config['client_id'][:10]}..." if config['client_id'] else None,
        'client_secret': "****" if config['client_secret'] else None,
        'refresh_token': f"{config['refresh_token'][:10]}..." if config['refresh_token'] else None,
        'token_url': config['token_url']
    }
    
    return jsonify({
        'config': safe_config,
        'forms': get_form_config(),
        'token_cached': token_manager.access_token is not None,
        'token_expires': token_manager.token_expires_at.isoformat() if token_manager.token_expires_at else None,
        'last_error': token_manager.last_error
    })

@app.route('/api/test/token')
def test_token():
    """Test token refresh endpoint"""
    try:
        token = token_manager.get_access_token()
        return jsonify({
            'success': True,
            'message': 'Token obtained successfully',
            'token_preview': f"{token[:20]}...",
            'expires_at': token_manager.token_expires_at.isoformat() if token_manager.token_expires_at else None
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'config': {
                'client_id_present': bool(get_zoho_config()['client_id']),
                'refresh_token_present': bool(get_zoho_config()['refresh_token'])
            }
        }), 500

# ==================== STATIONS ====================

@app.route('/api/stations', methods=['POST'])
def create_station():
    data = request.get_json()

    # Accept both snake_case (legacy) and PascalCase (frontend)
    station_code = data.get("Station_Code") or data.get("station_code")
    station_name = data.get("Station_Name") or data.get("station_name")
    city         = data.get("City")         or data.get("city")
    state        = data.get("State")        or data.get("state")

    if not all([station_code, station_name, city, state]):
        missing = [f for f, v in [("Station_Code", station_code), ("Station_Name", station_name), ("City", city), ("State", state)] if not v]
        return jsonify({'success': False, 'error': f'Missing fields: {", ".join(missing)}'}), 400

    payload = {
        "Station_Code":    station_code.strip().upper(),
        "Station_Name":    station_name.strip(),
        "City":            city.strip(),
        "State":           state.strip(),
        "Zone":            data.get("Zone") or data.get("zone") or "",
        "Station_Type":    data.get("Station_Type") or data.get("station_type") or "",
        "Latitude":        data.get("Latitude") or data.get("latitude") or None,
        "Longitude":       data.get("Longitude") or data.get("longitude") or None,
    }
    # Remove None values
    payload = {k: v for k, v in payload.items() if v is not None}

    result = zoho.create_record(zoho.forms['forms']['stations'], payload)
    return jsonify(result), result.get('status_code', 200)


@app.route('/api/stations', methods=['GET'])
def get_stations():
    limit = request.args.get('limit', 200, type=int)
    city = request.args.get('city')

    criteria = f'(City == "{city}")' if city else None

    result = zoho.get_all_records(
        zoho.forms['reports']['stations'],
        criteria=criteria,
        limit=limit
    )

    return jsonify(result), result.get('status_code', 200)


@app.route('/api/stations/<station_id>', methods=['GET'])
def get_station(station_id):
    result = zoho.get_record_by_id(
        zoho.forms['reports']['stations'],
        station_id
    )
    return jsonify(result), result.get('status_code', 200)


@app.route('/api/stations/<station_id>', methods=['PUT'])
def update_station(station_id):
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    # Accept PascalCase (frontend) or snake_case (legacy)
    payload = {
        "Station_Code": (data.get("Station_Code") or data.get("station_code") or "").strip().upper() or None,
        "Station_Name": (data.get("Station_Name") or data.get("station_name") or "").strip() or None,
        "City":         (data.get("City")         or data.get("city")         or "").strip() or None,
        "State":        (data.get("State")        or data.get("state")        or "").strip() or None,
        "Zone":         (data.get("Zone")         or data.get("zone")         or ""),
        "Station_Type": data.get("Station_Type") or data.get("station_type") or None,
        "Latitude":     data.get("Latitude")     or data.get("latitude")     or None,
        "Longitude":    data.get("Longitude")    or data.get("longitude")    or None,
    }
    # Remove None/empty values
    payload = {k: v for k, v in payload.items() if v is not None}

    result = zoho.update_record(
        zoho.forms['reports']['stations'],
        station_id,
        payload
    )
    return jsonify(result), result.get('status_code', 200)


@app.route('/api/stations/<station_id>', methods=['DELETE'])
def delete_station(station_id):
    result = zoho.delete_record(
        zoho.forms['reports']['stations'],
        station_id
    )
    return jsonify(result), result.get('status_code', 200)

# ==================== TRAINS ====================

@app.route('/api/trains', methods=['POST'])
def create_train():
    try:
        data = request.get_json()

        payload = {
            "Train_Number":    data.get("Train_Number") or data.get("train_number"),
            "Train_Name":      data.get("Train_Name")   or data.get("train_name"),
            "Train_Type":      data.get("Train_Type")   or data.get("train_type"),
            "From_Station":    extract_lookup_id(data.get("From_Station")),
            "To_Station":      extract_lookup_id(data.get("To_Station")),
            "Departure_Time":  data.get("Departure_Time"),
            "Arrival_Time":    data.get("Arrival_Time"),
            "Duration":        data.get("Duration")        or None,
            "Distance":        data.get("Distance")        or None,
            # Fares — all classes
            "Fare_SL":         float(data.get("Fare_SL")  or 0),
            "Fare_3A":         float(data.get("Fare_3A")  or 0),
            "Fare_2A":         float(data.get("Fare_2A")  or 0),
            "Fare_1A":         float(data.get("Fare_1A")  or 0),
            "Fare_CC":         float(data.get("Fare_CC")  or 0),
            "Fare_EC":         float(data.get("Fare_EC")  or 0),
            "Fare_2S":         float(data.get("Fare_2S")  or 0),
            # Seats
            "Total_Seats_SL":  int(data.get("Total_Seats_SL")  or 0),
            "Total_Seats_3A":  int(data.get("Total_Seats_3A")  or 0),
            "Total_Seats_2A":  int(data.get("Total_Seats_2A")  or 0),
            "Total_Seats_1A":  int(data.get("Total_Seats_1A")  or 0),
            "Total_Seats_CC":  int(data.get("Total_Seats_CC")  or 0),
            # Operational
            "Run_Days":        data.get("Run_Days")        or None,
            "Is_Active":       data.get("Is_Active", True),
        }
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        result = zoho.create_record(zoho.forms['forms']['trains'], payload)
        return jsonify(result), result.get('status_code', 200)

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
    


@app.route('/api/trains', methods=['GET'])
def get_trains():
    limit        = request.args.get('limit', 200, type=int)
    source       = request.args.get('source', '').strip().upper()
    destination  = request.args.get('destination', '').strip().upper()
    journey_date = request.args.get('journey_date')  # "YYYY-MM-DD"

    # FIX: No criteria at all — Is_Active field doesn't exist in Trains form
    # Fetch all, filter entirely client-side
    result = zoho.get_all_records(
        zoho.forms['reports']['trains'],
        criteria=None,
        limit=limit
    )

    if not result.get('success'):
        return jsonify(result), result.get('status_code', 500)

    records = result.get('data', {}).get('data', [])
    if not isinstance(records, list):
        records = []

    def get_code(field):
        """Extract code from display_value like 'MAS-Chennai Central' or '  SBC-Bangalore City'"""
        if not field:
            return ''
        dv = field.get('display_value', '') if isinstance(field, dict) else str(field)
        return dv.strip().split('-')[0].strip().upper()

    filtered = records

    if source:
        # Strict match: only trains whose ORIGIN (From_Station) == source
        # Mid-station stops must NOT appear here — those are handled by /api/trains/connecting
        filtered = [r for r in filtered if get_code(r.get('From_Station')) == source]
    if destination:
        # Strict match: only trains whose FINAL DESTINATION (To_Station) == destination
        filtered = [r for r in filtered if get_code(r.get('To_Station')) == destination]

    # Additional: filter out inactive trains
    filtered = [r for r in filtered if str(r.get('Is_Active', 'true')).lower() != 'false']

    if journey_date:
        try:
            from datetime import datetime as _dt
            DAY_ABBR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            day_name = DAY_ABBR[_dt.strptime(journey_date, '%Y-%m-%d').weekday()]
            def runs_on_day(rec):
                run_days = rec.get('Run_Days', '')
                if isinstance(run_days, list):
                    days_list = [d.strip() for d in run_days]
                elif isinstance(run_days, str) and run_days.strip():
                    days_list = [d.strip() for d in run_days.split(',')]
                else:
                    days_list = []
                return not days_list or day_name in days_list
            filtered = [r for r in filtered if runs_on_day(r)]
        except Exception as e:
            logger.warning(f"journey_date filter error: {e}")

    result = dict(result)
    result['data'] = dict(result.get('data', {}))
    result['data']['data'] = filtered
    return jsonify(result), result.get('status_code', 200)

@app.route('/api/trains/<train_id>', methods=['GET'])
def get_train(train_id):

    result = zoho.get_record_by_id(
        zoho.forms['reports']['trains'],
        train_id
    )

    return jsonify(result), result.get('status_code', 200)

    
@app.route('/api/trains/<train_id>', methods=['PUT'])
def update_train(train_id):
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    payload = {
        "Train_Number":   data.get("Train_Number"),
        "Train_Name":     data.get("Train_Name"),
        "Train_Type":     data.get("Train_Type"),
        "From_Station":   extract_lookup_id(data.get("From_Station")),
        "To_Station":     extract_lookup_id(data.get("To_Station")),
        "Departure_Time": data.get("Departure_Time"),
        "Arrival_Time":   data.get("Arrival_Time"),
        "Duration":       data.get("Duration") or None,
        "Distance":       data.get("Distance") or None,
        "Fare_SL":        float(data.get("Fare_SL")  or 0),
        "Fare_3A":        float(data.get("Fare_3A")  or 0),
        "Fare_2A":        float(data.get("Fare_2A")  or 0),
        "Fare_1A":        float(data.get("Fare_1A")  or 0),
        "Fare_CC":        float(data.get("Fare_CC")  or 0),
        "Fare_EC":        float(data.get("Fare_EC")  or 0),
        "Fare_2S":        float(data.get("Fare_2S")  or 0),
        "Total_Seats_SL": int(data.get("Total_Seats_SL") or 0),
        "Total_Seats_3A": int(data.get("Total_Seats_3A") or 0),
        "Total_Seats_2A": int(data.get("Total_Seats_2A") or 0),
        "Total_Seats_1A": int(data.get("Total_Seats_1A") or 0),
        "Total_Seats_CC": int(data.get("Total_Seats_CC") or 0),
        "Run_Days":       data.get("Run_Days") or None,
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    result = zoho.update_record(
        zoho.forms['reports']['trains'],
        train_id,
        payload
    )
    return jsonify(result), result.get('status_code', 200)

#============== BOOKINGS ====================

@app.route('/api/bookings/<booking_id>/paid', methods=['POST'])
def mark_booking_paid(booking_id):
    existing = zoho.get_record_by_id(zoho.forms['reports']['bookings'], booking_id)
    if not existing.get('success'):
        return jsonify({'success': False, 'error': 'Booking not found'}), 404
    rec = existing.get('data', {}).get('data', existing.get('data', {}))
    trains_id = (rec.get('Trains') or {}).get('ID') if isinstance(rec.get('Trains'), dict) else rec.get('Trains')
    users_id  = (rec.get('Users')  or {}).get('ID') if isinstance(rec.get('Users'),  dict) else rec.get('Users')
    payload = {
        "Class":           rec.get("Class", ""),
        "Journey_Date":    rec.get("Journey_Date", ""),
        "PNR":             rec.get("PNR", ""),
        "Passenger_Count": int(rec.get("Passenger_Count") or 0),
        "Passengers":      rec.get("Passengers"),
        "Booking_Status":  rec.get("Booking_Status", "pending"),
        "Payment_Status":  "paid",
        "Total_Fare":      float(rec.get("Total_Fare") or 0),
        "Booking_Time":    rec.get("Booking_Time", ""),
        "Trains":          trains_id,
        "Users":           users_id,
    }
    result = zoho.update_record(zoho.forms['reports']['bookings'], booking_id, payload)
    return jsonify(result), result.get('status_code', 200)

@app.route('/api/bookings/<booking_id>/cancel', methods=['POST'])
def cancel_booking(booking_id):
    existing = zoho.get_record_by_id(zoho.forms['reports']['bookings'], booking_id)
    if not existing.get('success'):
        return jsonify({'success': False, 'error': 'Booking not found'}), 404
    rec = existing.get('data', {}).get('data', existing.get('data', {}))
    trains_id = (rec.get('Trains') or {}).get('ID') if isinstance(rec.get('Trains'), dict) else rec.get('Trains')
    users_id  = (rec.get('Users')  or {}).get('ID') if isinstance(rec.get('Users'),  dict) else rec.get('Users')

    # Calculate refund amount from request or default to 0
    req_data = request.get_json() or {}
    refund_amount = float(req_data.get("Refund_Amount") or 0)
    cancellation_time = datetime.now().strftime("%d-%b-%Y %H:%M:%S")

    passengers_raw = rec.get("Passengers")
    if isinstance(passengers_raw, list):
        passengers_raw = json.dumps(passengers_raw)

    payload = {
        "Class":              rec.get("Class", ""),
        "Journey_Date":       rec.get("Journey_Date", ""),
        "PNR":                rec.get("PNR", ""),
        "Passenger_Count":    int(rec.get("Passenger_Count") or 0),
        "Passengers":         passengers_raw,
        "Quota":              rec.get("Quota", "GN"),
        "Booking_Status":     "cancelled",
        "Payment_Status":     rec.get("Payment_Status", "unpaid"),
        "Total_Fare":         float(rec.get("Total_Fare") or 0),
        "Booking_Time":       rec.get("Booking_Time", ""),
        "Cancellation_Time":  cancellation_time,
        "Refund_Amount":      refund_amount,
        "Trains":             trains_id,
        "Users":              users_id,
    }
    # Remove None values
    payload = {k: v for k, v in payload.items() if v is not None}

    result = zoho.update_record(zoho.forms['reports']['bookings'], booking_id, payload)
    return jsonify(result), result.get('status_code', 200)

@app.route('/api/trains/<train_id>', methods=['DELETE'])
def delete_train(train_id):

    result = zoho.delete_record(
        zoho.forms['reports']['trains'],
        train_id
    )

    return jsonify(result), result.get('status_code', 200)



# ==================== SETTINGS ====================

@app.route('/api/settings', methods=['POST'])
def create_setting():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    mapped_data = {
        "Type_field": (data.get("Type_field") or "").strip(),
        "Value": (data.get("Value") or "").strip()
    }

    is_valid, missing = validate_required(mapped_data, ['Type_field', 'Value'])
    if not is_valid:
        return jsonify({
            "success": False,
            "error": f"Missing fields: {', '.join(missing)}"
        }), 400

    
    result = zoho.create_record(
        zoho.forms["forms"]["settings"],
        mapped_data
    )

    print("Zoho response:", result)
    return jsonify(result), result.get("status_code", 200)


@app.route('/api/settings', methods=['GET'])
def get_settings():
    # Frontend-friendly query params
    limit = request.args.get("limit", 200, type=int)
    type_filter = request.args.get("type")      # frontend sends ?type=Seat Class
    value_filter = request.args.get("value")    # frontend sends ?value=Economy

    # Build Zoho criteria
    criteria_parts = []

    if type_filter:
        # Zoho field name
        criteria_parts.append(f'Type_field == "{type_filter}"')

    if value_filter:
        criteria_parts.append(f'Value.contains("{value_filter}")')

    criteria = " && ".join(criteria_parts) if criteria_parts else None

    result = zoho.get_all_records(
        zoho.forms["reports"]["settings"],
        criteria,
        limit
    )

    return jsonify(result), result.get("status_code", 200)


@app.route('/api/settings/<setting_id>', methods=['GET'])
def get_setting(setting_id):
    result = zoho.get_record_by_id(
        zoho.forms["reports"]["settings"],
        setting_id
    )

    return jsonify(result), result.get("status_code", 200)


@app.route('/api/settings/<setting_id>', methods=['PUT'])
def update_setting(setting_id):
    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "error": "No data provided"
        }), 400

    result = zoho.update_record(
        zoho.forms["reports"]["settings"],
        setting_id,
        data
    )

    return jsonify(result), result.get("status_code", 200)


@app.route('/api/settings/<setting_id>', methods=['DELETE'])
def delete_setting(setting_id):
    result = zoho.delete_record(
        zoho.forms["reports"]["settings"],
        setting_id
    )

    return jsonify(result), result.get("status_code", 200)



# ==================== USERS ====================

@app.route('/api/users', methods=['POST'])
def create_user():

    data = request.get_json()

    full_name = data.get("Full_Name", "").strip()
    email     = data.get("Email", "").strip()
    phone     = data.get("Phone_Number", "").strip()

    if not all([full_name, email, phone]):
        missing = [f for f, v in [("Full_Name", full_name), ("Email", email), ("Phone_Number", phone)] if not v]
        return jsonify({"success": False, "error": f"Missing fields: {', '.join(missing)}"}), 400

    mapped_data = {
        "Full_Name":      full_name,
        "Email":          email,
        "Phone_Number":   phone,
        "Address":        data.get("Address", ""),
        "Role":           data.get("Role", "User"),
        "Date_of_Birth":  data.get("Date_of_Birth") or None,
        "ID_Proof_Type":  data.get("ID_Proof_Type") or None,
        "ID_Proof_Number": data.get("ID_Proof_Number") or None,
    }
    # Remove None values
    mapped_data = {k: v for k, v in mapped_data.items() if v is not None}

    result = zoho.create_record(
        zoho.forms["forms"]["users"],
        mapped_data
    )

    return jsonify(result), result.get("status_code", 200)


@app.route('/api/users', methods=['GET'])
def get_users():

    limit = request.args.get("limit", 200, type=int)
    role = request.args.get("role")

    criteria = f'(Role == "{role}")' if role else None

    result = zoho.get_all_records(
        zoho.forms["reports"]["users"],
        criteria,
        limit
    )

    return jsonify(result), result.get("status_code", 200)



@app.route('/api/users/<user_id>', methods=['GET'])
def get_user(user_id):

    result = zoho.get_record_by_id(
        zoho.forms["reports"]["users"],
        user_id
    )

    return jsonify(result), result.get("status_code", 200)



@app.route('/api/users/<user_id>', methods=['PUT'])
def update_user(user_id):

    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "error": "No data provided"
        }), 400

    payload = {
        "Full_Name":       data.get("Full_Name"),
        "Email":           data.get("Email"),
        "Phone_Number":    data.get("Phone_Number"),
        "Address":         data.get("Address"),
        "Role":            data.get("Role"),
        "Date_of_Birth":   data.get("Date_of_Birth") or None,
        "ID_Proof_Type":   data.get("ID_Proof_Type") or None,
        "ID_Proof_Number": data.get("ID_Proof_Number") or None,
    }
    # Remove None values to avoid overwriting with nulls
    payload = {k: v for k, v in payload.items() if v is not None}

    result = zoho.update_record(
        zoho.forms["reports"]["users"],
        user_id,
        payload
    )

    return jsonify(result), result.get("status_code", 200)

@app.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):

    result = zoho.delete_record(
        zoho.forms["reports"]["users"],
        user_id
    )

    return jsonify(result), result.get("status_code", 200)


# ==================== BOOKINGS ====================
@app.route('/api/bookings', methods=['POST'])
def create_booking():
    data = request.get_json()

    def _safe_lookup_id(val):
        if isinstance(val, dict):
            return val.get("ID") or val.get("id")
        return val

    passengers_raw = data.get("Passengers", [])
    if isinstance(passengers_raw, list):
        passengers_str = json.dumps(passengers_raw)
    else:
        passengers_str = passengers_raw

    pnr = data.get("PNR") or ("PNR" + uuid.uuid4().hex[:8].upper())

    # FIX: normalize Journey_Date — frontend sends "YYYY-MM-DD", Zoho needs "DD-MMM-YYYY"
    def _to_zoho_date(date_str):
        if not date_str: return None
        s = str(date_str).strip()
        MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        if len(s) >= 11 and s[2] == '-' and s[6] == '-':
            return s.split(' ')[0]  # already Zoho format
        if len(s) >= 10 and s[4] == '-' and s[7] == '-':
            try:
                yyyy, mm, dd = s[:10].split('-')
                return f"{dd.zfill(2)}-{MONTHS[int(mm)-1]}-{yyyy}"
            except Exception: pass
        return s

    # FIX: normalize Booking_Time — frontend sends ISO, Zoho needs "DD-MMM-YYYY HH:MM:SS"
    def _to_zoho_datetime(dt_str):
        MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        if not dt_str:
            return datetime.now().strftime("%d-%b-%Y %H:%M:%S")
        s = str(dt_str).strip()
        if len(s) >= 11 and s[2] == '-' and s[6] == '-':
            return s  # already Zoho format
        try:
            dt = datetime.strptime(s.replace('T', ' ')[:19], "%Y-%m-%d %H:%M:%S")
            return dt.strftime("%d-%b-%Y %H:%M:%S")
        except Exception: pass
        return datetime.now().strftime("%d-%b-%Y %H:%M:%S")

    payload = {
        "Class":           data.get("Class"),
        "Journey_Date":    to_zoho_date_only(data.get("Journey_Date")),
        "PNR":             pnr,
        "Passenger_Count": int(data.get("Passenger_Count") or 0),
        "Passengers":      passengers_str,
        "Quota":           data.get("Quota", "GN"),   # FIX: was "General", schema uses "GN"
        "Booking_Status":  data.get("Booking_Status", "pending"),
        "Payment_Status":  data.get("Payment_Status", "unpaid"),
        "Total_Fare":      float(data.get("Total_Fare") or 0),
        "Booking_Time":    _to_zoho_datetime(data.get("Booking_Time")),
        "Trains":          _safe_lookup_id(data.get("Trains")),
        "Users":           _safe_lookup_id(data.get("Users")),
    }
    payload = {k: v for k, v in payload.items() if v is not None and v != ""}

    result = zoho.create_record(zoho.forms['forms']['bookings'], payload)
    if result.get('success'):
        result['data'] = result.get('data', {})
        result['data']['PNR'] = pnr
    return jsonify(result), result.get('status_code', 200)

# ── NEW: GET /api/bookings/pnr/<pnr> ──────────────────────────────────────
@app.route('/api/bookings/pnr/<string:pnr>', methods=['GET'])
def get_booking_by_pnr(pnr):
    """Lookup a single booking by PNR number."""
    result = zoho.get_all_records(
        zoho.forms['reports']['bookings'],
        criteria=f'(PNR == "{pnr.strip().upper()}")',
        limit=1
    )
    if not result.get('success'):
        return jsonify(result), result.get('status_code', 500)

    records = result.get('data', {}).get('data', [])
    if not records:
        return jsonify({'success': False, 'error': f'No booking found for PNR: {pnr}'}), 404

    return jsonify({
        'success': True,
        'data': {'data': records[0]},
        'status_code': 200
    }), 200

@app.route('/api/bookings', methods=['GET'])
def get_bookings():
    limit   = request.args.get('limit', 200, type=int)
    user_id = request.args.get('user_id')
    status  = request.args.get('status')
    pnr     = request.args.get('pnr')

    # Only text fields in criteria — NOT lookup fields (Zoho rejects lookup criteria)
    criteria_parts = []
    if status:
        criteria_parts.append(f'(Booking_Status == "{status}")')
    if pnr:
        criteria_parts.append(f'(PNR == "{pnr.strip().upper()}")')
    criteria = ' && '.join(criteria_parts) if criteria_parts else None

    result = zoho.get_all_records(
        zoho.forms['reports']['bookings'],
        criteria=criteria,
        limit=limit
    )
    if not result.get('success'):
        return jsonify(result), result.get('status_code', 500)

    records = result.get('data', {}).get('data', [])

    # Filter by user in Python — Zoho lookup criteria broken for large IDs
    if user_id:
        records = [b for b in records
                   if str((b.get('Users') or {}).get('ID', '')) == str(user_id)]

    return jsonify({'success': True, 'data': {'data': records}, 'status_code': 200}), 200

@app.route('/api/bookings/<booking_id>', methods=['GET'])
def get_booking(booking_id):
    result = zoho.get_record_by_id(zoho.forms['reports']['bookings'], booking_id)
    return jsonify(result), result.get('status_code', 200)


@app.route('/api/bookings/<booking_id>', methods=['PUT'])
def update_booking(booking_id):
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    def _safe_lookup_id(val):
        if isinstance(val, dict):
            return val.get("ID") or val.get("id")
        return val

    passengers_raw = data.get("Passengers")
    if isinstance(passengers_raw, list):
        passengers_str = json.dumps(passengers_raw)
    else:
        passengers_str = passengers_raw  # already string or None

    payload = {
        "Class":               data.get("Class"),
        "Journey_Date":        data.get("Journey_Date"),
        "PNR":                 data.get("PNR") or f"PNR{uuid.uuid4().hex[:8].upper()}",
        "Passenger_Count":     int(data.get("Passenger_Count") or 0),
        "Passengers":          passengers_str,
        "Quota":               data.get("Quota", "GN"),
        "Booking_Status":      (data.get("Booking_Status", "pending") or "pending").lower(),
        "Payment_Status":      (data.get("Payment_Status", "unpaid")  or "unpaid").lower(),
        "Total_Fare":          float(data.get("Total_Fare") or 0),
        "Booking_Time":        data.get("Booking_Time"),
        "Cancellation_Time":   data.get("Cancellation_Time") or None,
        "Refund_Amount":       float(data.get("Refund_Amount") or 0) if data.get("Refund_Amount") else None,
        "Trains":              _safe_lookup_id(data.get("Trains")),
        "Users":               _safe_lookup_id(data.get("Users")),
    }
    # Remove None values
    payload = {k: v for k, v in payload.items() if v is not None}

    result = zoho.update_record(zoho.forms['reports']['bookings'], booking_id, payload)
    return jsonify(result), result.get('status_code', 200)


@app.route('/api/bookings/<booking_id>', methods=['DELETE'])
def delete_booking(booking_id):
    result = zoho.delete_record(zoho.forms['reports']['bookings'], booking_id)
    return jsonify(result), result.get('status_code', 200)

@app.route('/api/bookings/<booking_id>/confirm', methods=['POST'])
def confirm_booking(booking_id):
    existing = zoho.get_record_by_id(zoho.forms['reports']['bookings'], booking_id)
    if not existing.get('success'):
        return jsonify({'success': False, 'error': 'Booking not found'}), 404
    rec = existing.get('data', {}).get('data', existing.get('data', {}))
    trains_id = (rec.get('Trains') or {}).get('ID') if isinstance(rec.get('Trains'), dict) else rec.get('Trains')
    users_id  = (rec.get('Users')  or {}).get('ID') if isinstance(rec.get('Users'),  dict) else rec.get('Users')
    payload = {
        "Class":           rec.get("Class", ""),
        "Journey_Date":    rec.get("Journey_Date", ""),
        "PNR":             rec.get("PNR", ""),
        "Passenger_Count": int(rec.get("Passenger_Count") or 0),
        "Passengers":      rec.get("Passengers"),
        "Booking_Status":  "confirmed",
        "Payment_Status":  "paid",
        "Total_Fare":      float(rec.get("Total_Fare") or 0),
        "Booking_Time":    rec.get("Booking_Time", ""),
        "Trains":          trains_id,
        "Users":           users_id,
    }
    result = zoho.update_record(zoho.forms['reports']['bookings'], booking_id, payload)
    return jsonify(result), result.get('status_code', 200)


# ==================== OVERVIEW STATS ====================

@app.route('/api/overview/stats', methods=['GET'])
def overview_stats():
    """Aggregate counts for the admin dashboard OverviewPage."""
    def count_records(report_name):
        try:
            result = zoho.get_all_records(report_name, limit=1000)
            records = result.get('data', {}).get('data', []) if result.get('success') else []
            return len(records)
        except Exception:
            return 0

    forms = get_form_config()
    stats = {
        'total_stations': count_records(forms['reports']['stations']),
        'total_trains':   count_records(forms['reports']['trains']),
        'total_users':    count_records(forms['reports']['users']),
        'total_bookings': count_records(forms['reports']['bookings']),
    }
    return jsonify({'success': True, 'data': stats}), 200



# ==================== USER BOOKINGS (My Bookings / Upcoming Journeys) ====================
@app.route('/api/users/<user_id>/bookings', methods=['GET'])
def get_user_bookings(user_id):
    upcoming_only = request.args.get('upcoming', '').lower() == 'true'
    status_filter = request.args.get('status')

    # NO Zoho criteria — fetch all bookings, filter in Python
    result = zoho.get_all_records(
        zoho.forms['reports']['bookings'],
        criteria=None,
        limit=500
    )

    if not result.get('success'):
        return jsonify(result), result.get('status_code', 500)

    records = result.get('data', {}).get('data', [])

    logger.info(f"get_user_bookings: total records fetched = {len(records)}")

    # Filter by user ID — Users is a lookup: { "ID": "...", "display_value": "..." }
    records = [b for b in records
           if str((b.get('Users') or {}).get('ID', '')) == str(user_id)]


    logger.info(f"get_user_bookings: after user filter = {len(records)}")

    # Filter by status
    if status_filter:
        records = [b for b in records
                   if (b.get('Booking_Status') or '').lower() == status_filter.lower()]

    # Filter upcoming
    if upcoming_only:
        today = datetime.now().strftime('%Y-%m-%d')
        def to_ymd(jd):
            if not jd: return ''
            try:
                if len(jd.split('-')[0]) == 4: return jd[:10]
                return datetime.strptime(jd.split(' ')[0], '%d-%b-%Y').strftime('%Y-%m-%d')
            except: return ''
        records = [b for b in records if to_ymd(b.get('Journey_Date', '')) >= today]

    return jsonify({
        'success': True,
        'data': {'data': records, 'count': len(records)},
        'status_code': 200
    }), 200

# ==================== TRAIN SCHEDULE ====================

@app.route('/api/trains/<train_id>/schedule', methods=['GET'])
def get_train_schedule(train_id):
    """GET /api/trains/{id}/schedule — returns full stop list for a train.
    Tries TrainRoutes report first. Falls back to returning origin/destination from Trains.
    """
    # Try fetching from a TrainRoutes table/report
    try:
        # BUG FIX: Zoho field is "Trains" (plural); list view returns Route_Stops as
        # {display_value, ID} stubs only — must call get_record_by_id for real stop data.
        route_result = zoho.get_all_records(
            zoho.forms['reports']['train_routes'],
            criteria=f'(Trains == "{train_id}")',
            limit=5
        )
        if route_result.get('success'):
            route_list = route_result.get('data', {}).get('data', [])
            if route_list:
                route_id = route_list[0].get('ID')
                full_res = zoho.get_record_by_id(zoho.forms['reports']['train_routes'], route_id)
                if full_res.get('success'):
                    full_route = full_res.get('data', {}).get('data', full_res.get('data', {}))
                    routes = _get_route_stops(full_route)
                    if routes:
                        routes.sort(key=lambda r: int(r.get('Sequence') or 0))
                        stops = [{
                            'sequence':     r.get('Sequence'),
                            'station_name': r.get('Station_Name') or r.get('Station', ''),
                            'station_code': r.get('Station_Code', ''),
                            'arrival':      r.get('Arrival_Time', '--'),
                            'departure':    r.get('Departure_Time', '--'),
                            'halt_mins':    r.get('Halt_Minutes', 0),
                            'distance_km':  r.get('Distance_KM', ''),
                        } for r in routes]
                        return jsonify({'success': True, 'data': {'stops': stops, 'count': len(stops)}, 'status_code': 200}), 200
    except Exception:
        pass

    # Fallback: return origin and destination from Trains record
    train_result = zoho.get_record_by_id(zoho.forms['reports']['trains'], train_id)
    if not train_result.get('success'):
        return jsonify({'success': False, 'error': 'Train not found'}), 404

    rec   = train_result.get('data', {}).get('data', train_result.get('data', {}))
    from_st = rec.get('From_Station', {})
    to_st   = rec.get('To_Station', {})

    stops = [
        {
            'sequence':     1,
            'station_name': from_st.get('display_value', '') if isinstance(from_st, dict) else str(from_st),
            'station_code': '',
            'arrival':      None,
            'departure':    rec.get('Departure_Time', '--'),
            'halt_mins':    0,
        },
        {
            'sequence':     2,
            'station_name': to_st.get('display_value', '') if isinstance(to_st, dict) else str(to_st),
            'station_code': '',
            'arrival':      rec.get('Arrival_Time', '--'),
            'departure':    None,
            'halt_mins':    0,
        },
    ]
    return jsonify({
        'success': True,
        'data': {'stops': stops, 'count': 2, 'note': 'Intermediate stops not configured'},
        'status_code': 200
    }), 200


# ==================== TRAIN VACANCY (Seat Availability) ====================

@app.route('/api/trains/<train_id>/vacancy', methods=['GET'])
def get_train_vacancy(train_id):
    """GET /api/trains/{id}/vacancy?date=YYYY-MM-DD
    Returns available seats per class = Total_Seats_X - booked_confirmed_for_date.
    """
    journey_date = request.args.get('date')  # YYYY-MM-DD or DD-MMM-YYYY

    # 1. Get train info
    train_result = zoho.get_record_by_id(zoho.forms['reports']['trains'], train_id)
    if not train_result.get('success'):
        return jsonify({'success': False, 'error': 'Train not found'}), 404

    rec = train_result.get('data', {}).get('data', train_result.get('data', {}))

    total = {
        'SL':  int(rec.get('Total_Seats_SL') or 0),
        '3AC': int(rec.get('Total_Seats_3A') or 0),
        '2AC': int(rec.get('Total_Seats_2A') or 0),
    }

    # 2. Get confirmed bookings for this train
    criteria = f'(Trains == "{train_id}") && (Booking_Status == "confirmed")'
    bookings_result = zoho.get_all_records(
        zoho.forms['reports']['bookings'],
        criteria=criteria,
        limit=1000
    )
    bookings = bookings_result.get('data', {}).get('data', []) if bookings_result.get('success') else []

    # 3. Filter by date if provided
    if journey_date:
        def date_matches(b):
            jd = b.get('Journey_Date', '')
            if not jd:
                return False
            try:
                if len(jd.split('-')[0]) == 4:
                    return jd[:10] == journey_date
                dt = datetime.strptime(jd.split(' ')[0], '%d-%b-%Y')
                return dt.strftime('%Y-%m-%d') == journey_date
            except Exception:
                return False
        bookings = [b for b in bookings if date_matches(b)]

    # 4. Tally booked per class
    booked = {'SL': 0, '3AC': 0, '2AC': 0}
    class_map = {
        'sleeper': 'SL', 'sl': 'SL', '2s': 'SL',
        '3ac': '3AC', '3a': '3AC',
        '2ac': '2AC', '2a': '2AC',
        '1ac': '2AC', '1a': '2AC',  # fallback to 2AC bucket
        'cc': 'SL', 'ec': '2AC', 'fc': '2AC',
    }
    for b in bookings:
        cls_raw = (b.get('Class') or '').lower().strip()
        cls_key = class_map.get(cls_raw, 'SL')
        booked[cls_key] += int(b.get('Passenger_Count') or 1)

    # 5. Build response
    vacancy = {}
    fare_map = {'SL': 'Fare_SL', '3AC': 'Fare_3A', '2AC': 'Fare_2A'}
    label_map = {'SL': 'Sleeper', '3AC': '3rd AC', '2AC': '2nd AC'}

    for cls_key in ['SL', '3AC', '2AC']:
        tot = total[cls_key]
        bkd = min(booked[cls_key], tot)
        vacancy[cls_key] = {
            'label':     label_map[cls_key],
            'total':     tot,
            'booked':    bkd,
            'available': max(0, tot - bkd),
            'fare':      float(rec.get(fare_map[cls_key]) or 0),
        }

    return jsonify({
        'success': True,
        'data': vacancy,
        'meta': {
            'train_id':     train_id,
            'train_name':   rec.get('Train_Name', ''),
            'journey_date': journey_date,
            'bookings_counted': len(bookings),
        },
        'status_code': 200
    }), 200




# ==================== TRAIN ROUTES (Subform-based stop management) ====================
#
# ZOHO CREATOR DATABASE DESIGN:
# ─────────────────────────────
# Form: Train_Routes  (parent form — one record per TRAIN)
#   Fields:
#     Train          (Lookup → Trains form)          — which train this route belongs to
#     Train_Number   (Formula / text)                — denormalised for display
#     Train_Name     (Formula / text)                — denormalised for display
#     Total_Stops    (Formula: count of subform rows)
#     Notes          (Text)
#
# Subform: Route_Stops  (child subform inside Train_Routes)
#   Fields:
#     Sequence       (Number, required)              — stop order: 1=origin, last=destination
#     Station_Name   (Text, required)                — full station name
#     Station_Code   (Text)                          — IRCTC code e.g. MAS, NDLS
#     Stations       (Lookup → Stations form)        — optional master-station link
#     Arrival_Time   (Time)                          — scheduled arrival
#     Departure_Time (Time)                          — scheduled departure
#     Halt_Minutes   (Number)                        — stop duration in minutes
#     Distance_KM    (Decimal)                       — cumulative distance from origin
#     Day_Count      (Number, default 1)             — journey day (for multi-day trains)
#
# Report: All_Train_Routes  (report over Train_Routes form)
# Report: All_Route_Stops   (report over Route_Stops subform — Zoho auto-creates)
#
# API ARCHITECTURE:
# ─────────────────
# GET    /api/train-routes                → list all Train_Routes records (one per train)
# GET    /api/train-routes?train_id=X     → get route record + all stops for train X
# POST   /api/train-routes                → create a new Train_Routes record for a train
# GET    /api/train-routes/<route_id>     → get single route record with its stops
# PUT    /api/train-routes/<route_id>     → update route-level fields
# DELETE /api/train-routes/<route_id>     → delete entire route (and all its stops)
#
# GET    /api/train-routes/<route_id>/stops              → list stops (subform rows)
# POST   /api/train-routes/<route_id>/stops              → add a stop (subform row)
# PUT    /api/train-routes/<route_id>/stops/<stop_id>    → update a stop
# DELETE /api/train-routes/<route_id>/stops/<stop_id>    → delete a stop
#
# GET    /api/train-routes/connections?station_code=MAS  → all trains passing through a station
# GET    /api/train-routes/connections/all               → full cross-train connection map
#
# ZOHO CREATOR SUBFORM API NOTES:
# ─────────────────────────────────
# Creating a record with subform rows:
#   POST /api/v2/{owner}/{app}/form/Train_Routes
#   Body: { "data": [{ "Train": "...", "Route_Stops": [ { "Sequence":1, ... } ] }] }
#
# Updating subform rows — Zoho requires the parent record ID + subform row ID:
#   PATCH /api/v2/{owner}/{app}/report/All_Train_Routes/{route_id}
#   Body: { "data": { "Route_Stops": [ { "ID": "stop_id", "Halt_Minutes": 5 } ] } }
#
# Adding new rows to existing record:
#   PATCH with rows that have no "ID" field — Zoho treats them as new inserts
#
# Deleting a subform row:
#   PATCH with { "data": { "Route_Stops": [ { "ID": "stop_id", "_delete": true } ] } }
# ──────────────────────────────────────────────────────────────────────────────────────

# ── HELPER: fetch all Train_Routes records with FULL Route_Stops subform data ───
# Zoho's list-view returns Route_Stops as {display_value, ID} stubs only.
# Full stop fields (Station_Name, Code, Times, etc.) are only available
# when fetching each record individually by ID.
def _fetch_all_routes_full(limit=500):
    """
    Returns list of Train_Routes records, each with real Route_Stops data.
    Strategy:
      1. Fetch list view (fast, 1 call) — Route_Stops are stubs here.
      2. _get_route_stops() now parses stubs via display_value → no extra
         per-record API calls needed unless display_value is also missing.
    Falls back to get_record_by_id only when display_value parsing yields nothing.
    """
    list_res = zoho.get_all_records(
        zoho.forms['reports']['train_routes'],
        criteria=None,
        limit=limit
    )
    if not list_res.get('success'):
        return []

    route_list = list_res.get('data', {}).get('data', [])
    full_routes = []
    for r in route_list:
        rid = r.get('ID')
        if not rid:
            continue
        # _get_route_stops parses display_value stubs automatically
        parsed_stops = _get_route_stops(r)
        if parsed_stops:
            # Inject parsed stops back so callers can use them directly
            r = dict(r)
            r['_parsed_stops'] = parsed_stops
            full_routes.append(r)
        else:
            # No display_value either — fetch full record
            full_res = zoho.get_record_by_id(
                zoho.forms['reports']['train_routes'], rid
            )
            if full_res.get('success'):
                full_rec = full_res.get('data', {}).get('data', full_res.get('data', {}))
                full_routes.append(full_rec)
            else:
                full_routes.append(r)
    return full_routes


def _build_stop_payload(data):
    """Build a clean subform row dict from request data."""
    stop = {}
    station_id = extract_lookup_id(data.get('Stations') or data.get('station_id'))
    if station_id:
        stop['Stations'] = station_id
    
    # BUG FIX: Handle None values properly (undefined from frontend becomes null in JSON)
    # When undefined is sent, data.get('Station_Name', '') returns None (not the default),
    # so we need to handle None explicitly to avoid calling .strip() on None
    station_name = data.get('Station_Name')
    if station_name and isinstance(station_name, str) and station_name.strip():
        stop['Station_Name'] = station_name.strip()
    
    station_code = data.get('Station_Code')
    if station_code and isinstance(station_code, str) and station_code.strip():
        stop['Station_Code'] = station_code.strip().upper()
    
    if data.get('Sequence') not in (None, ''):
        stop['Sequence'] = int(data['Sequence'])
    if data.get('Arrival_Time'):
        stop['Arrival_Time'] = str(data['Arrival_Time'])
    if data.get('Departure_Time'):
        stop['Departure_Time'] = str(data['Departure_Time'])
    if data.get('Halt_Minutes') not in (None, ''):
        stop['Halt_Minutes'] = int(data['Halt_Minutes'])
    if data.get('Distance_KM') not in (None, ''):
        stop['Distance_KM'] = float(data['Distance_KM'])
    stop['Day_Count'] = int(data['Day_Count']) if data.get('Day_Count') not in (None, '') else 1
    return stop


def _extract_train_id(field):
    """Extract train ID from lookup field (dict or string)."""
    if isinstance(field, dict):
        return field.get('ID', '')
    return str(field or '')


def _parse_stop_display_value(dv, stop_id):
    """
    Parse Zoho stub display_value into a real stop dict.
    Zoho formats:
      With times:    "SEQ ARR DAY NAME CODE  NAME DEP STOP_ID"
      Without times: "SEQ  DAY NAME CODE  NAME  STOP_ID"
    Used as fallback when get_record_by_id returns stub-only Route_Stops.
    """
    import re
    raw = str(dv).strip()
    time_re = r'\b\d{2}:\d{2}(?::\d{2})?\b'

    tokens = raw.split()
    seq = int(tokens[0]) if tokens and tokens[0].isdigit() else None

    times = re.findall(time_re, raw)
    arr_time = times[0][:5] if len(times) >= 1 else None
    dep_time = times[1][:5] if len(times) >= 2 else None

    # Remove seq, times, long Zoho IDs
    clean = re.sub(r'\b\d{15,}\b', '', raw)
    clean = re.sub(time_re, '', clean)
    clean = re.sub(r'^\s*\d+\s+', '', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()

    # Day count: first single-digit token
    day_match = re.match(r'^(\d)\s+', clean)
    day = int(day_match.group(1)) if day_match else 1
    if day_match:
        clean = clean[day_match.end():]

    # Station code: short ALL-CAPS word (2–5 letters)
    code_match = re.search(r'\b([A-Z]{2,5})\b', clean)
    code = code_match.group(1) if code_match else ''

    # Station name: text before the code
    if code:
        idx = clean.find(code)
        name = clean[:idx].strip()
    else:
        parts = re.split(r'\s{2,}', clean)
        name = parts[0].strip() if parts else clean.strip()

    return {
        'ID':             stop_id,
        'Sequence':       seq,
        'Station_Name':   name,
        'Station_Code':   code,
        'Arrival_Time':   arr_time,
        'Departure_Time': dep_time,
        'Day_Count':      day,
        'Halt_Minutes':   '',
        'Distance_KM':    '',
    }


def _get_route_stops(route_record):
    """
    Extract Route_Stops subform rows from a Train_Routes record.
    - If fetched via get_record_by_id: rows have full fields → return as-is.
    - If fetched via list view (stubs): rows only have {display_value, ID}
      → parse display_value to recover real stop data.
    """
    stops = route_record.get('Route_Stops', [])
    if not isinstance(stops, list):
        return []

    real_stops = []
    for s in stops:
        if not isinstance(s, dict):
            continue
        # Stub detection: no Station_Name and no Station_Code = list-view stub
        if not s.get('Station_Name') and not s.get('Station_Code') and s.get('display_value'):
            parsed = _parse_stop_display_value(s['display_value'], s.get('ID', ''))
            real_stops.append(parsed)
        else:
            real_stops.append(s)
    return real_stops


# ── GET /api/train-routes  — list all train route records ──────────────────────
@app.route('/api/train-routes', methods=['GET'])
def get_train_routes():
    """
    GET /api/train-routes             → all Train_Routes records (summary, no stops)
    GET /api/train-routes?train_id=X  → route record + parsed stops for that train

    KEY INSIGHT: Zoho NEVER returns full subform field values for Route_Stops —
    not in list view, not in get_record_by_id. Every stop row always comes as:
        { "display_value": "SEQ [ARR] DAY NAME CODE NAME [DEP] ID", "ID": "..." }
    All stop data lives inside display_value. _get_route_stops() calls
    _parse_stop_display_value() to extract Sequence, Station_Name, Station_Code,
    Arrival_Time, Departure_Time, Day_Count from that string.

    Therefore get_record_by_id calls are SKIPPED — they waste API calls and
    return the same stubs. We parse stops directly from the list-view response.
    """
    train_id = request.args.get('train_id', '').strip()
    limit    = request.args.get('limit', 200, type=int)

    if train_id:
        # Fetch all route records once (list view with stub stops)
        result = zoho.get_all_records(
            zoho.forms['reports']['train_routes'],
            criteria=None,
            limit=500
        )
        if not result.get('success'):
            return jsonify(result), result.get('status_code', 500)

        all_records = result.get('data', {}).get('data', [])

        # Python-side filter: Zoho field name is "Trains" (plural lookup)
        matched = []
        for r in all_records:
            trains_field = r.get('Trains') or r.get('Train') or {}
            rec_train_id = trains_field.get('ID', '') if isinstance(trains_field, dict) else str(trains_field or '')
            if rec_train_id == train_id:
                matched.append(r)

        if not matched:
            return jsonify({
                'success': True,
                'data': {'data': [], 'count': 0, 'route_record': None},
                'status_code': 200
            }), 200

        # Collect stops from all matched records (handles duplicate route records).
        # _get_route_stops() parses display_value stubs via _parse_stop_display_value().
        all_stops = []
        for rec in matched:
            all_stops.extend(_get_route_stops(rec))

        # De-duplicate by stop ID, sort by Sequence
        seen_ids     = set()
        unique_stops = []
        for s in all_stops:
            sid = s.get('ID', '')
            if sid and sid not in seen_ids:
                seen_ids.add(sid)
                unique_stops.append(s)
        unique_stops.sort(key=lambda s: int(s.get('Sequence') or 0))

        return jsonify({
            'success': True,
            'data': {
                'route_record':    matched[0],
                'stops':           unique_stops,
                'count':           len(unique_stops),
                'duplicate_routes': len(matched) > 1,
                'route_count':     len(matched),
            },
            'status_code': 200
        }), 200

    # No train_id — summary list only
    result = zoho.get_all_records(zoho.forms['reports']['train_routes'], criteria=None, limit=limit)
    if not result.get('success'):
        return jsonify(result), result.get('status_code', 500)

    routes = result.get('data', {}).get('data', [])
    for r in routes:
        r['_stop_count'] = len(_get_route_stops(r))

    return jsonify({'success': True, 'data': {'data': routes, 'count': len(routes)}, 'status_code': 200}), 200


# ── GET /api/train-routes/<route_id>  — single route with all stops ────────────
@app.route('/api/train-routes/<route_id>', methods=['GET'])
def get_train_route(route_id):
    # Zoho always returns Route_Stops as stubs even via get_record_by_id.
    # _get_route_stops() parses display_value to extract real stop fields.
    result = zoho.get_record_by_id(zoho.forms['reports']['train_routes'], route_id)
    if not result.get('success'):
        return jsonify(result), result.get('status_code', 200)

    route = result.get('data', {}).get('data', result.get('data', {}))
    stops = _get_route_stops(route)
    stops.sort(key=lambda s: int(s.get('Sequence') or 0))

    return jsonify({
        'success': True,
        'data': {'route_record': route, 'stops': stops, 'count': len(stops)},
        'status_code': 200
    }), 200


# ── POST /api/train-routes  — create a new route record (with optional initial stops) ─
@app.route('/api/train-routes', methods=['POST'])
def create_train_route():
    """
    Create a Train_Routes parent record for a train.
    Optionally include initial stops in Route_Stops subform.

    Body:
      {
        "Train": "<train_id>",
        "Notes": "...",
        "stops": [                          ← optional initial subform rows
          { "Sequence":1, "Station_Name":"Chennai Central", "Station_Code":"MAS", ... },
          ...
        ]
      }
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    train_id = extract_lookup_id(data.get('Train') or data.get('Trains') or data.get('train_id'))
    if not train_id:
        return jsonify({'success': False, 'error': 'Train is required'}), 400

    # ── Check if a route record already exists for this train ──
    # BUG FIX: use server-side criteria with correct field name "Trains"
    existing = zoho.get_all_records(
        zoho.forms['reports']['train_routes'],
        criteria=f'(Trains == "{train_id}")',
        limit=5
    )
    if existing.get('success'):
        dup = existing.get('data', {}).get('data', [])
        if dup:
            return jsonify({
                'success': False,
                'error': 'A route record already exists for this train. Use PUT to update or use the stops endpoints.',
                'existing_route_id': dup[0].get('ID')
            }), 409

    # ── Build payload — Zoho field is "Trains" (plural) ──
    payload = {'Trains': train_id}
    if data.get('Notes'):
        payload['Notes'] = data['Notes'].strip()

    # Add initial stops as subform rows
    stops_input = data.get('stops', [])
    if stops_input and isinstance(stops_input, list):
        subform_rows = [_build_stop_payload(s) for s in stops_input]
        payload['Route_Stops'] = subform_rows

    result = zoho.create_record(zoho.forms['forms']['train_routes'], payload)
    return jsonify(result), result.get('status_code', 200)


# ── PUT /api/train-routes/<route_id>  — update route-level fields ──────────────
@app.route('/api/train-routes/<route_id>', methods=['PUT'])
def update_train_route(route_id):
    """Update route-level fields (Notes, Train). Does NOT touch stops."""
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    payload = {}
    train_id = extract_lookup_id(data.get('Train') or data.get('Trains') or data.get('train_id'))
    if train_id:
        payload['Trains'] = train_id  # BUG FIX: Zoho field is "Trains" (plural)
    if data.get('Notes') is not None:
        payload['Notes'] = data['Notes']

    result = zoho.update_record(zoho.forms['reports']['train_routes'], route_id, payload)
    return jsonify(result), result.get('status_code', 200)


# ── DELETE /api/train-routes/<route_id>  — delete entire route record ──────────
@app.route('/api/train-routes/<route_id>', methods=['DELETE'])
def delete_train_route(route_id):
    """Delete the Train_Routes record (and all its Route_Stops subform rows)."""
    result = zoho.delete_record(zoho.forms['reports']['train_routes'], route_id)
    return jsonify(result), result.get('status_code', 200)


# ── GET /api/train-routes/<route_id>/stops  — list stops (subform rows) ────────
@app.route('/api/train-routes/<route_id>/stops', methods=['GET'])
def get_route_stops(route_id):
    """Return all Route_Stops subform rows for a Train_Routes record, sorted by Sequence."""
    result = zoho.get_record_by_id(zoho.forms['reports']['train_routes'], route_id)
    if not result.get('success'):
        return jsonify(result), result.get('status_code', 500)

    route = result.get('data', {}).get('data', result.get('data', {}))
    stops = _get_route_stops(route)
    stops.sort(key=lambda s: int(s.get('Sequence') or 0))

    return jsonify({
        'success': True,
        'data': {'stops': stops, 'count': len(stops), 'route_id': route_id},
        'status_code': 200
    }), 200


def _get_existing_stop_refs(route_id):
    """
    CRITICAL helper for all subform PATCH operations.

    Zoho Creator v2 REPLACES the ENTIRE Route_Stops subform array when you
    PATCH with a Route_Stops list — even if you only intend to add/update one row.
    Any row whose ID is absent from the payload is silently DELETED.

    Fix: always fetch the current stop IDs and include them in every PATCH.
    Rows sent with only {ID: '...'} (no other fields) are preserved unchanged.
    A new row with no ID is inserted. A row with ID + fields is updated.
    A row with {ID, _delete: None} is deleted.
    """
    report = zoho.forms['reports']['train_routes']
    res = zoho.get_record_by_id(report, route_id)
    if not res.get('success'):
        return []
    rec = res.get('data', {}).get('data', res.get('data', {}))
    if not isinstance(rec, dict):
        return []
    return [
        {'ID': s['ID']}
        for s in rec.get('Route_Stops', [])
        if isinstance(s, dict) and s.get('ID')
    ]


# ── POST /api/train-routes/<route_id>/stops  — add a stop (subform row) ────────
@app.route('/api/train-routes/<route_id>/stops', methods=['POST'])
def add_route_stop(route_id):
    """
    Add a new stop (subform row) to an existing Train_Routes record.

    Zoho subform insert: PATCH the parent record with the new row (no ID = insert).
    Body: { "Sequence":3, "Station_Name":"Bangalore City", "Station_Code":"SBC", ... }
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    seq = data.get('Sequence')
    if seq is None or str(seq).strip() == '':
        return jsonify({'success': False, 'error': 'Sequence is required'}), 400
    if not (data.get('Station_Name', '').strip() or data.get('Stations')):
        return jsonify({'success': False, 'error': 'Station_Name or Stations lookup is required'}), 400

    stop_row = _build_stop_payload(data)
    report   = zoho.forms['reports']['train_routes']

    # CRITICAL FIX (BUG: Zoho replaces entire subform on PATCH)
    # Always include all existing stop IDs so they are preserved.
    # Rows sent with only {ID} are kept unchanged by Zoho.
    # New row has no ID → Zoho inserts it as a new subform row.
    existing = _get_existing_stop_refs(route_id)
    payload  = {'Route_Stops': existing + [stop_row]}
    result   = zoho.update_record(report, route_id, payload)

    logger.info(f"add_route_stop route={route_id} preserved={len(existing)} new={stop_row} → {result}")
    return jsonify(result), result.get('status_code', 200)


# ── PUT /api/train-routes/<route_id>/stops/<stop_id>  — update a subform row ───
@app.route('/api/train-routes/<route_id>/stops/<stop_id>', methods=['PUT'])
def update_route_stop(route_id, stop_id):
    """
    Update an existing subform row.
    Body: { "Station_Name": "...", "Departure_Time": "14:30", ... }
    
    CRITICAL: Zoho REPLACES the entire Route_Stops array when PATCH-ing,
    so we fetch all existing rows and send them back to avoid data loss.
    Only the target row is updated; others are preserved with {ID: '...'}.
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    # Validate required fields for update
    seq = data.get('Sequence')
    if seq is None or str(seq).strip() == '':
        return jsonify({'success': False, 'error': 'Sequence is required'}), 400
    if not (data.get('Station_Name', '').strip() or data.get('Stations')):
        return jsonify({'success': False, 'error': 'Station_Name or Stations lookup is required'}), 400

    stop_row        = _build_stop_payload(data)
    stop_row['ID']  = stop_id          # required: Zoho matches row by ID
    report          = zoho.forms['reports']['train_routes']

    # CRITICAL FIX: Fetch all existing rows; send every row so none are wiped.
    # The target row is replaced with updated data; all others are preserved as {ID}.
    existing  = _get_existing_stop_refs(route_id)
    all_rows  = []
    replaced  = False
    for ref in existing:
        if ref['ID'] == stop_id:
            all_rows.append(stop_row)   # updated row (with ID + new fields)
            replaced = True
        else:
            all_rows.append(ref)        # unchanged row (only ID needed to preserve it)
    if not replaced:
        all_rows.append(stop_row)       # safety: stop wasn't in the fetched list

    payload = {'Route_Stops': all_rows}
    logger.info(f"update_route_stop route={route_id} stop={stop_id} input_data={data} updated_stop={stop_row} total_rows={len(all_rows)}")
    result  = zoho.update_record(report, route_id, payload)
    
    if not result.get('success'):
        logger.error(f"update_route_stop failed: {result.get('error') or result}")

    logger.info(f"update_route_stop result: {result}")
    return jsonify(result), result.get('status_code', 200)


# ── DELETE /api/train-routes/<route_id>/stops/<stop_id>  — delete a subform row ─
@app.route('/api/train-routes/<route_id>/stops/<stop_id>', methods=['DELETE'])
def delete_route_stop(route_id, stop_id):
    """
    Delete a single subform row by excluding it from the next full-subform PATCH.
    Zoho treats any row absent from the payload as deleted.
    """
    report = zoho.forms['reports']['train_routes']

    # CRITICAL FIX: fetch all rows, send everything EXCEPT the deleted stop.
    # This is more reliable than _delete:None across all Zoho plan tiers.
    existing  = _get_existing_stop_refs(route_id)
    remaining = [ref for ref in existing if ref['ID'] != stop_id]
    payload   = {'Route_Stops': remaining}
    result    = zoho.update_record(report, route_id, payload)

    logger.info(f"delete_route_stop route={route_id} stop={stop_id} remaining={len(remaining)} → {result}")
    return jsonify(result), result.get('status_code', 200)


# ── GET /api/train-routes/connections  — connection map ────────────────────────
@app.route('/api/train-routes/connections', methods=['GET'])
def get_route_connections():
    """
    GET /api/train-routes/connections?station_code=MAS
      → all trains passing through station MAS, with their stop details

    GET /api/train-routes/connections/all  (see below)

    Algorithm:
      1. Fetch all Train_Routes records (each has Route_Stops subform)
      2. For each stop in each train's route, index by Station_Code
      3. Stations with 2+ trains = connection point
      4. Return: { "MAS": { station_code, station_name, trains: [...] }, ... }
    """
    station_code = request.args.get('station_code', '').strip().upper()

    # BUG FIX: use _fetch_all_routes_full — list view returns Route_Stops as stubs only
    all_routes = _fetch_all_routes_full(limit=500)
    if not all_routes:
        # still return success, just empty
        pass

    # Fetch all trains for metadata
    trains_res = zoho.get_all_records(zoho.forms['reports']['trains'], limit=500)
    trains_list = trains_res.get('data', {}).get('data', []) if trains_res.get('success') else []
    trains_by_id = {str(t.get('ID', '')): t for t in trains_list}

    # Build station → trains index
    station_index = {}   # station_code → { station_name, trains: [] }

    for route_rec in all_routes:
        # BUG FIX: Zoho field is "Trains" (plural)
        train_field = route_rec.get('Trains') or route_rec.get('Train') or {}
        train_id    = _extract_train_id(train_field)
        train_meta  = trains_by_id.get(train_id, {})
        train_name  = train_meta.get('Train_Name', route_rec.get('Train_Name', ''))
        train_num   = train_meta.get('Train_Number', route_rec.get('Train_Number', ''))

        stops = route_rec.get('_parsed_stops') or _get_route_stops(route_rec)
        total_stops = len(stops)
        stops_sorted = sorted(stops, key=lambda s: int(s.get('Sequence') or 0))

        for i, stop in enumerate(stops_sorted):
            code = (stop.get('Station_Code') or '').strip().upper()
            name = (stop.get('Station_Name') or '').strip()
            if not code:
                continue

            seq = int(stop.get('Sequence') or 0)
            if i == 0:
                stop_type = 'origin'
            elif i == total_stops - 1:
                stop_type = 'destination'
            else:
                stop_type = 'intermediate'

            if code not in station_index:
                station_index[code] = {'station_code': code, 'station_name': name, 'trains': []}

            station_index[code]['trains'].append({
                'train_id':     train_id,
                'train_name':   train_name,
                'train_number': train_num,
                'stop_type':    stop_type,
                'sequence':     seq,
                'arrival':      stop.get('Arrival_Time'),
                'departure':    stop.get('Departure_Time'),
                'halt_minutes': stop.get('Halt_Minutes'),
                'distance_km':  stop.get('Distance_KM'),
                'day_count':    stop.get('Day_Count', 1),
            })

    # Filter: only stations where 2+ trains stop = connection points
    connection_stations = {k: v for k, v in station_index.items() if len(v['trains']) >= 2}

    if station_code:
        # Return only the requested station
        if station_code not in station_index:
            return jsonify({'success': True, 'data': {'station_code': station_code, 'trains': [], 'is_connection': False}, 'status_code': 200}), 200
        entry = station_index[station_code]
        return jsonify({
            'success': True,
            'data': {
                'station_code':  station_code,
                'station_name':  entry['station_name'],
                'trains':        entry['trains'],
                'is_connection': len(entry['trains']) >= 2,
                'train_count':   len(entry['trains']),
            },
            'status_code': 200
        }), 200

    # No filter — return full connection map
    return jsonify({
        'success': True,
        'data': {
            'connection_stations': connection_stations,
            'all_stations':        station_index,
            'connection_count':    len(connection_stations),
            'total_stations':      len(station_index),
        },
        'status_code': 200
    }), 200


# ── GET /api/train-routes/connections/all  — full connection map ────────────────
@app.route('/api/train-routes/connections/all', methods=['GET'])
def get_all_connections():
    """
    Full cross-train connection map.
    Returns every station that is shared by 2+ trains, with full train metadata.
    """
    # BUG FIX: use _fetch_all_routes_full — list view returns Route_Stops as stubs only
    all_routes = _fetch_all_routes_full(limit=500)

    trains_res = zoho.get_all_records(zoho.forms['reports']['trains'], limit=500)
    trains_list = trains_res.get('data', {}).get('data', []) if trains_res.get('success') else []
    trains_by_id = {str(t.get('ID', '')): t for t in trains_list}

    # station_code → set of train_ids
    station_trains = {}

    for route_rec in all_routes:
        # BUG FIX: Zoho field is "Trains" (plural)
        train_id = _extract_train_id(route_rec.get('Trains') or route_rec.get('Train') or {})
        train_meta = trains_by_id.get(train_id, {})
        stops = sorted(route_rec.get('_parsed_stops') or _get_route_stops(route_rec), key=lambda s: int(s.get('Sequence') or 0))
        n = len(stops)

        for i, stop in enumerate(stops):
            code = (stop.get('Station_Code') or '').strip().upper()
            if not code:
                continue
            if code not in station_trains:
                station_trains[code] = {
                    'station_code': code,
                    'station_name': stop.get('Station_Name', ''),
                    'trains': []
                }
            station_trains[code]['trains'].append({
                'train_id':     train_id,
                'train_name':   train_meta.get('Train_Name', ''),
                'train_number': train_meta.get('Train_Number', ''),
                'from_station': train_meta.get('From_Station', {}).get('display_value', '') if isinstance(train_meta.get('From_Station'), dict) else '',
                'to_station':   train_meta.get('To_Station', {}).get('display_value', '') if isinstance(train_meta.get('To_Station'), dict) else '',
                'stop_type':    'origin' if i==0 else ('destination' if i==n-1 else 'intermediate'),
                'sequence':     int(stop.get('Sequence') or 0),
                'arrival':      stop.get('Arrival_Time'),
                'departure':    stop.get('Departure_Time'),
                'halt_minutes': stop.get('Halt_Minutes'),
                'distance_km':  stop.get('Distance_KM'),
            })

    # Only connection points (2+ trains)
    connections = {k: v for k, v in station_trains.items() if len(v['trains']) >= 2}

    # Build route pairs: train A ↔ train B via station
    pairs = []
    for code, info in connections.items():
        train_ids = [t['train_id'] for t in info['trains']]
        for idx_a in range(len(train_ids)):
            for idx_b in range(idx_a+1, len(train_ids)):
                ta = info['trains'][idx_a]
                tb = info['trains'][idx_b]
                dep_a = ta.get('departure')
                arr_b = tb.get('arrival') or tb.get('departure')
                transfer = None
                if dep_a and arr_b:
                    try:
                        def _mins(t):
                            h, m = t.split(':')[:2]
                            return int(h)*60 + int(m)
                        diff = _mins(arr_b) - _mins(dep_a)
                        if diff < 0: diff += 1440
                        transfer = diff
                    except Exception:
                        pass
                pairs.append({
                    'via_station':    code,
                    'via_name':       info['station_name'],
                    'train_a':        ta,
                    'train_b':        tb,
                    'transfer_mins':  transfer,
                    'feasible':       transfer is None or transfer >= 20,
                })

    pairs.sort(key=lambda p: (p['transfer_mins'] or 9999))

    return jsonify({
        'success': True,
        'data': {
            'connection_stations': connections,
            'connection_pairs':    pairs,
            'total_connections':   len(connections),
            'total_pairs':         len(pairs),
        },
        'status_code': 200
    }), 200


# ==================== SEARCH TRAINS BY MID-STATION ====================

@app.route('/api/trains/search-by-station', methods=['GET'])
def search_trains_by_station():
    """
    GET /api/trains/search-by-station?station_code=NGP&journey_date=2026-04-10

    Returns all trains that pass through the given station — whether as
    origin, destination, or any intermediate stop in Train_Routes.

    Response per train includes:
      - All standard train fields
      - stop_info: { sequence, arrival_time, departure_time, halt_minutes, distance_km }
      - stop_type: 'origin' | 'destination' | 'intermediate'
    """
    station_code = request.args.get('station_code', '').strip().upper()
    journey_date = request.args.get('journey_date', '')

    if not station_code:
        return jsonify({'success': False, 'error': 'station_code is required'}), 400

    # ── 1. Fetch all train routes with FULL stop data ─────────────────────────
    # BUG FIX: list view returns Route_Stops as stubs; use _fetch_all_routes_full
    all_routes = _fetch_all_routes_full(limit=500)

    # ── 2. Build: train_id → sorted stops ────────────────────────────────────
    from collections import defaultdict
    train_stops = defaultdict(list)
    for r in all_routes:
        # BUG FIX: Zoho field is "Trains" (plural); use _parsed_stops when available
        t_field = r.get('Trains') or r.get('Train') or {}
        t_id    = t_field.get('ID') if isinstance(t_field, dict) else str(t_field or '')
        if t_id:
            for stop in (r.get('_parsed_stops') or _get_route_stops(r)):
                stop['_train_id'] = t_id
                train_stops[t_id].append(stop)
    for t_id in train_stops:
        train_stops[t_id].sort(key=lambda s: int(s.get('Sequence') or 0))

    def get_stop_code(stop):
        code = (stop.get('Station_Code') or '').strip().upper()
        if code:
            return code
        st = stop.get('Stations', {})
        if isinstance(st, dict):
            dv = (st.get('display_value') or '').strip()
            return dv.split('-')[0].strip().upper() if dv else ''
        return ''

    # ── 3. Find which trains have this station as a stop ─────────────────────
    matching_train_ids = {}   # train_id → stop_record
    for t_id, stops in train_stops.items():
        for stop in stops:
            if get_stop_code(stop) == station_code:
                seq      = int(stop.get('Sequence') or 0)
                max_seq  = int(stops[-1].get('Sequence') or 0)
                if   seq == int(stops[0].get('Sequence') or 0): stop_type = 'origin'
                elif seq == max_seq:                             stop_type = 'destination'
                else:                                           stop_type = 'intermediate'
                matching_train_ids[t_id] = {
                    'stop_type':    stop_type,
                    'sequence':     seq,
                    'arrival_time':    stop.get('Arrival_Time'),
                    'departure_time':  stop.get('Departure_Time'),
                    'halt_minutes':    stop.get('Halt_Minutes'),
                    'distance_km':     stop.get('Distance_KM'),
                }
                break

    # ── 4. Also check From_Station / To_Station on Trains (no route entry) ───
    trains_res  = zoho.get_all_records(zoho.forms['reports']['trains'], limit=500)
    trains_list = trains_res.get('data', {}).get('data', []) if trains_res.get('success') else []

    def get_code(field):
        if not field: return ''
        dv = field.get('display_value', '') if isinstance(field, dict) else str(field)
        return dv.strip().split('-')[0].strip().upper()

    result_trains = []
    for t in trains_list:
        t_id = str(t.get('ID', ''))
        if str(t.get('Is_Active', 'true')).lower() == 'false':
            continue

        # Journey date / run_days filter
        if journey_date:
            try:
                from datetime import datetime as _dt
                DAY_ABBR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
                day_name = DAY_ABBR[_dt.strptime(journey_date, '%Y-%m-%d').weekday()]
                run_days = t.get('Run_Days', '')
                if isinstance(run_days, list):
                    days_list = [d.strip() for d in run_days]
                elif isinstance(run_days, str) and run_days.strip():
                    days_list = [d.strip() for d in run_days.split(',')]
                else:
                    days_list = []
                if days_list and day_name not in days_list:
                    continue
            except Exception:
                pass

        # Check if station is in routes
        if t_id in matching_train_ids:
            t['stop_info'] = matching_train_ids[t_id]
            t['stop_type'] = matching_train_ids[t_id]['stop_type']
            result_trains.append(t)
        # Fallback: check From_Station / To_Station directly on train record
        elif get_code(t.get('From_Station')) == station_code:
            t['stop_info'] = {'stop_type': 'origin', 'sequence': 1, 'departure_time': t.get('Departure_Time')}
            t['stop_type'] = 'origin'
            result_trains.append(t)
        elif get_code(t.get('To_Station')) == station_code:
            t['stop_info'] = {'stop_type': 'destination', 'departure_time': None, 'arrival_time': t.get('Arrival_Time')}
            t['stop_type'] = 'destination'
            result_trains.append(t)

    # Sort: origin first, then intermediate, then destination
    order = {'origin': 0, 'intermediate': 1, 'destination': 2}
    result_trains.sort(key=lambda x: order.get(x.get('stop_type', 'intermediate'), 1))

    return jsonify({
        'success': True,
        'data': {
            'station_code': station_code,
            'journey_date': journey_date,
            'trains': result_trains,
            'count': len(result_trains),
        },
        'status_code': 200,
    }), 200


# ==================== CONNECTING TRAINS ====================

@app.route('/api/trains/connecting', methods=['GET'])
def get_connecting_trains():
    """
    Find connecting train journeys between two stations.
    GET /api/trains/connecting?from=MAS&to=NDLS&date=2026-04-10

    Algorithm:
    1. Find all direct trains from `from` → `to` (already done in /api/trains)
    2. For each possible connecting station C:
       - Leg 1: trains that pass through `from` AND `C`  (from_seq < c_seq)
       - Leg 2: trains that pass through `C` AND `to`    (c_seq < to_seq)
       - Connecting station C must have departure_leg2 >= arrival_leg1 + 30min buffer

    Returns: { direct: [...], connecting: [ { leg1, leg2, via_station, transfer_mins } ] }
    """
    from_code = request.args.get('from', '').strip().upper()
    to_code   = request.args.get('to',   '').strip().upper()
    date_str  = request.args.get('date', '')    # YYYY-MM-DD
    limit     = request.args.get('limit', 200, type=int)

    if not from_code or not to_code:
        return jsonify({'success': False, 'error': 'from and to are required'}), 400

    # ── 1. Fetch ALL train routes with FULL stop data ─────────────────────────
    # BUG FIX: list view returns Route_Stops as stubs; use _fetch_all_routes_full
    all_routes = _fetch_all_routes_full(limit=500)

    # ── 2. Build lookup: train_id → list of stops (sorted by Sequence) ───────
    from collections import defaultdict
    train_stops = defaultdict(list)
    for r in all_routes:
        # BUG FIX: Zoho field is "Trains" (plural); use _parsed_stops when available
        t_field = r.get('Trains') or r.get('Train') or {}
        t_id    = t_field.get('ID') if isinstance(t_field, dict) else str(t_field or '')
        if t_id:
            for stop in (r.get('_parsed_stops') or _get_route_stops(r)):
                train_stops[t_id].append(stop)
    for t_id in train_stops:
        train_stops[t_id].sort(key=lambda s: int(s.get('Sequence') or 0))

    # ── 3. Fetch all trains (for metadata) ────────────────────────────────────
    trains_res = zoho.get_all_records(zoho.forms['reports']['trains'], limit=limit)
    trains_list = trains_res.get('data', {}).get('data', []) if trains_res.get('success') else []
    trains_by_id = {str(t.get('ID', '')): t for t in trains_list}

    def get_station_code(stop):
        """Normalize station code from a route stop record."""
        code = (stop.get('Station_Code') or '').strip().upper()
        if code:
            return code
        # fallback: from lookup Station field display_value
        st = stop.get('Stations', {})
        if isinstance(st, dict):
            dv = (st.get('display_value') or '').strip()
            # display_value may be "MAS-Chennai Central" → take part before -
            return dv.split('-')[0].strip().upper() if dv else ''
        return ''

    def find_seq(stops, station_code):
        """Return (sequence, stop_record) or None."""
        for s in stops:
            if get_station_code(s) == station_code:
                return int(s.get('Sequence') or 0), s
        return None

    def parse_time_to_mins(time_str):
        """Convert HH:MM or HH:MM:SS to minutes since midnight."""
        if not time_str:
            return None
        try:
            parts = str(time_str).strip().split(':')
            return int(parts[0]) * 60 + int(parts[1])
        except Exception:
            return None

    # ── 4. Classify trains: direct, or has from/to as stops ──────────────────
    direct_train_ids   = set()
    trains_via_from    = {}   # train_id → (seq_from, stop_from)
    trains_via_to      = {}   # train_id → (seq_to, stop_to)

    for t_id, stops in train_stops.items():
        from_info = find_seq(stops, from_code)
        to_info   = find_seq(stops, to_code)
        if from_info and to_info:
            seq_from, _ = from_info
            seq_to, _   = to_info
            if seq_from < seq_to:
                direct_train_ids.add(t_id)
        if from_info:
            trains_via_from[t_id] = from_info
        if to_info:
            trains_via_to[t_id] = to_info

    # ── 5. Find connecting via each intermediate station ──────────────────────
    # Build: connecting_station → { leg1_trains: [], leg2_trains: [] }
    via_stations = defaultdict(lambda: {'leg1': [], 'leg2': []})

    # Leg 1 candidates: trains that go from_code → some_station (from_seq < other_seq)
    for t_id, (seq_from, stop_from) in trains_via_from.items():
        if t_id in direct_train_ids:
            continue
        stops = train_stops[t_id]
        for s in stops:
            via_code = get_station_code(s)
            if not via_code or via_code == from_code:
                continue
            via_seq = int(s.get('Sequence') or 0)
            if via_seq > seq_from:
                via_stations[via_code]['leg1'].append({
                    'train_id':       t_id,
                    'seq_from':       seq_from,
                    'seq_to':         via_seq,
                    'stop_from':      stop_from,
                    'stop_to':        s,
                    'arrival_via':    s.get('Arrival_Time'),
                    'departure_from': stop_from.get('Departure_Time'),
                })

    # Leg 2 candidates: trains that go some_station → to_code
    for t_id, (seq_to, stop_to) in trains_via_to.items():
        if t_id in direct_train_ids:
            continue
        stops = train_stops[t_id]
        for s in stops:
            via_code = get_station_code(s)
            if not via_code or via_code == to_code:
                continue
            via_seq = int(s.get('Sequence') or 0)
            if via_seq < seq_to:
                via_stations[via_code]['leg2'].append({
                    'train_id':          t_id,
                    'seq_from':          via_seq,
                    'seq_to':            seq_to,
                    'stop_from':         s,
                    'stop_to':           stop_to,
                    'departure_via':     s.get('Departure_Time'),
                    'arrival_to':        stop_to.get('Arrival_Time'),
                })

    # ── 6. Pair leg1 + leg2 at each via station ────────────────────────────────
    connections = []
    for via_code, legs in via_stations.items():
        for l1 in legs['leg1']:
            for l2 in legs['leg2']:
                if l1['train_id'] == l2['train_id']:
                    continue  # same train → direct (already captured)

                # Connection time check (arrival leg1 < departure leg2 + 30 min buffer)
                arr_mins = parse_time_to_mins(l1['arrival_via'])
                dep_mins = parse_time_to_mins(l2['departure_via'])
                if arr_mins is not None and dep_mins is not None:
                    transfer_mins = dep_mins - arr_mins
                    # Allow overnight connections (add 1440 if negative)
                    if transfer_mins < 0:
                        transfer_mins += 1440
                    if transfer_mins < 30:
                        continue  # too tight
                else:
                    transfer_mins = None

                t1 = trains_by_id.get(l1['train_id'], {})
                t2 = trains_by_id.get(l2['train_id'], {})

                connections.append({
                    'via_station':    via_code,
                    'transfer_mins':  transfer_mins,
                    'leg1': {
                        'train_id':      l1['train_id'],
                        'train_name':    t1.get('Train_Name', ''),
                        'train_number':  t1.get('Train_Number', ''),
                        'train_type':    t1.get('Train_Type', ''),
                        'from_code':     from_code,
                        'to_code':       via_code,
                        'departure':     l1['departure_from'],
                        'arrival':       l1['arrival_via'],
                        'fare_sl':       t1.get('Fare_SL', 0),
                        'fare_3a':       t1.get('Fare_3A', 0),
                        'fare_2a':       t1.get('Fare_2A', 0),
                        'train_record':  t1,
                    },
                    'leg2': {
                        'train_id':      l2['train_id'],
                        'train_name':    t2.get('Train_Name', ''),
                        'train_number':  t2.get('Train_Number', ''),
                        'train_type':    t2.get('Train_Type', ''),
                        'from_code':     via_code,
                        'to_code':       to_code,
                        'departure':     l2['departure_via'],
                        'arrival':       l2['arrival_to'],
                        'fare_sl':       t2.get('Fare_SL', 0),
                        'fare_3a':       t2.get('Fare_3A', 0),
                        'fare_2a':       t2.get('Fare_2A', 0),
                        'train_record':  t2,
                    },
                })

    # Sort by transfer_mins
    connections.sort(key=lambda c: (c['transfer_mins'] or 9999))
    # Deduplicate (same pair of trains at same via)
    seen = set()
    unique_connections = []
    for c in connections:
        key = (c['leg1']['train_id'], c['leg2']['train_id'], c['via_station'])
        if key not in seen:
            seen.add(key)
            unique_connections.append(c)

    # ── 7. Build direct trains list ───────────────────────────────────────────
    direct_trains = [trains_by_id[t_id] for t_id in direct_train_ids if t_id in trains_by_id]

    return jsonify({
        'success': True,
        'data': {
            'from':        from_code,
            'to':          to_code,
            'date':        date_str,
            'direct':      direct_trains,
            'connecting':  unique_connections[:20],  # cap at 20 results
            'total_direct':     len(direct_trains),
            'total_connecting': len(unique_connections),
        },
        'status_code': 200
    }), 200

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {str(error)}")
    return jsonify({'success': False, 'error': 'Internal server error', 'message': str(error)}), 500


# ==================== FARES ====================





@app.route('/api/fares', methods=['GET'])
def get_fares():
    try:
        params = request.args
        conditions = []
        if params.get('train_id'):
            conditions.append(f'(Train == "{params["train_id"]}")')
        if params.get('from_station'):
            conditions.append(f'(From_Station == "{params["from_station"]}")')
        if params.get('to_station'):
            conditions.append(f'(To_Station == "{params["to_station"]}")')
        if params.get('class'):
            conditions.append(f'(Class == "{params["class"]}")')
        if params.get('concession_type'):
            conditions.append(f'(Concession_Type == "{params["concession_type"]}")')
        if params.get('is_active') == 'true':
            conditions.append('(Is_Active == true)')
        elif params.get('is_active') == 'false':
            conditions.append('(Is_Active == false)')

        criteria = " && ".join(conditions) if conditions else None

        data = zoho.get_all_records(zoho.forms['reports']['fares'], criteria=criteria)
        return jsonify(data), data.get('status_code', 200)
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

@app.route('/api/fares/<id>', methods=['GET'])
def get_fare(id):
    try:
        data = zoho.get_record_by_id(zoho.forms['reports']['fares'], id)
        return jsonify(data), data.get('status_code', 200)
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

@app.route('/api/fares', methods=['POST'])
def create_fare():
    try:
        data = request.get_json()
        
        # Validate required fields
        required = ['Train', 'From_Station', 'To_Station', 'Class', 'Base_Fare']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({"success": False, "error": f"Missing: {', '.join(missing)}", "status_code": 400}), 400

        # Normalize Is_Active — frontend sends boolean or string
        is_active = data.get('Is_Active', True)
        if isinstance(is_active, str):
            is_active = is_active.lower() not in ('false', '0', 'no', 'inactive')

        base_fare   = float(data.get('Base_Fare', 0))
        dynamic_fare = float(data.get('Dynamic_Fare') or base_fare)

        payload = {
            "Train":              extract_lookup_id(data.get('Train')),
            "From_Station":       extract_lookup_id(data.get('From_Station')),
            "To_Station":         extract_lookup_id(data.get('To_Station')),
            "Class":              data.get('Class'),
            "Base_Fare":          base_fare,
            "Dynamic_Fare":       dynamic_fare,
            "Concession_Type":    data.get('Concession_Type', 'General'),
            "Concession_Percent": float(data.get('Concession_Percent') or 0),
            "Distance_KM":        float(data.get('Distance_KM') or 0) if data.get('Distance_KM') else None,
            "Effective_From":     data.get('Effective_From') or None,
            "Effective_To":       data.get('Effective_To') or None,
            "Is_Active":          is_active,
        }
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        result = zoho.create_record(zoho.forms['forms']['fares'], payload)
        return jsonify(result), result.get('status_code', 201)
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

@app.route('/api/fares/<id>', methods=['PUT'])
def update_fare(id):
    try:
        data = request.get_json()

        # Normalize Is_Active
        is_active = data.get('Is_Active', True)
        if isinstance(is_active, str):
            is_active = is_active.lower() not in ('false', '0', 'no', 'inactive')

        payload = {
            "Train":              extract_lookup_id(data.get('Train')),
            "From_Station":       extract_lookup_id(data.get('From_Station')),
            "To_Station":         extract_lookup_id(data.get('To_Station')),
            "Class":              data.get('Class'),
            "Base_Fare":          float(data.get('Base_Fare', 0)),
            "Dynamic_Fare":       float(data.get('Dynamic_Fare') or data.get('Base_Fare') or 0),
            "Concession_Type":    data.get('Concession_Type', 'General'),
            "Concession_Percent": float(data.get('Concession_Percent') or 0),
            "Distance_KM":        float(data.get('Distance_KM') or 0) if data.get('Distance_KM') else None,
            "Effective_From":     data.get('Effective_From') or None,
            "Effective_To":       data.get('Effective_To') or None,
            "Is_Active":          is_active,
        }
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        result = zoho.update_record(zoho.forms['reports']['fares'], id, payload)
        return jsonify(result), result.get('status_code', 200)
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

@app.route('/api/fares/<id>', methods=['DELETE'])
def delete_fare(id):
    try:
        result = zoho.delete_record(zoho.forms['reports']['fares'], id)
        return jsonify(result), result.get('status_code', 200)
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

@app.route('/api/fares/calculate', methods=['POST'])
def calculate_fare():
    """
    Calculate final fare with all factors.
    Falls back to train's stored fare if no Fares record found.
    """
    try:
        data = request.get_json()

        train_id        = data.get("train_id")
        cls             = data.get("class", "SL")
        passenger_count = int(data.get('passenger_count', 1))
        concession_type = data.get('concession_type', 'General')
        journey_date    = data.get('journey_date')

        base_fare    = 0.0
        dynamic_fare = 0.0

        # Try to get fare from Fares table
        criteria = f'(Train == "{train_id}") && (Class == "{cls}") && (Is_Active == true)'
        fares_result = zoho.get_all_records(zoho.forms['reports']['fares'], criteria=criteria)
        fares = fares_result.get('data', {}).get('data', []) if fares_result.get('success') else []

        if fares:
            base_fare    = float(fares[0].get('Base_Fare', 0))
            dynamic_fare = float(fares[0].get('Dynamic_Fare', base_fare) or base_fare)
        else:
            # Fallback: use Train record's fare fields
            train_result = zoho.get_record_by_id(zoho.forms['reports']['trains'], train_id)
            if train_result.get('success'):
                rec = train_result.get('data', {}).get('data', train_result.get('data', {}))
                fare_field_map = {
                    'SL': 'Fare_SL', '3A': 'Fare_3A', '3AC': 'Fare_3A',
                    '2A': 'Fare_2A', '2AC': 'Fare_2A', '1A': 'Fare_1A', '1AC': 'Fare_1A',
                    'CC': 'Fare_CC', 'EC': 'Fare_EC', '2S': 'Fare_2S',
                }
                fare_field = fare_field_map.get(cls, 'Fare_SL')
                base_fare    = float(rec.get(fare_field) or rec.get('Fare_SL') or 0)
                dynamic_fare = base_fare

        # Apply concession
        concession_percent = get_concession_percent(concession_type)
        concession_amount  = round((base_fare * concession_percent / 100) * passenger_count, 2)

        # Apply dynamic pricing (surge) only on the difference
        surge_multiplier = get_surge_multiplier(journey_date)
        surge_amount     = round((dynamic_fare - base_fare) * surge_multiplier * passenger_count, 2)
        surge_amount     = max(0, surge_amount)

        # Subtotal, GST, fees
        subtotal         = round((base_fare * passenger_count) + surge_amount - concession_amount, 2)
        gst              = round(subtotal * 0.05, 2)
        convenience_fee  = 30 * passenger_count
        total            = round(subtotal + gst + convenience_fee, 2)

        breakdown = {
            "base_fare":               round(base_fare * passenger_count, 2),
            "dynamic_fare_adjustment": surge_amount,
            "concession_discount":     -concession_amount,
            "gst_5_percent":           gst,
            "convenience_fee":         convenience_fee,
            "total":                   total,
            "concession_type":         concession_type,
            "passenger_count":         passenger_count,
        }

        return jsonify({"success": True, "data": breakdown, "status_code": 200})

    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

# ============================ CONCESSIONS API ================
@app.route('/api/concessions', methods=['GET'])
def get_concessions():
    try:
        params = request.args
        criteria = 'Is_Active == true' if params.get('is_active') == 'true' else ""
        data = zoho.get_all_records('All_Concessions', criteria=criteria)
        return jsonify({"success": True, "data": data, "status_code": 200})
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

@app.route('/api/concessions', methods=['POST'])
def create_concession():
    try:
        data = request.get_json()
        result = zoho.create_record('Concessions', data)
        return jsonify({"success": True, "data": result, "status_code": 201})
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

@app.route('/api/concessions/<id>', methods=['PUT'])
def update_concession(id):
    try:
        data = request.get_json()
        result = zoho.update_record('All_Concessions', id, data)
        return jsonify({"success": True, "data": result, "status_code": 200})
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

@app.route('/api/concessions/<id>', methods=['DELETE'])
def delete_concession(id):
    try:
        result = zoho.delete_record('All_Concessions', id)
        return jsonify({"success": True, "data": result, "status_code": 200})
    except Exception as e:
        return jsonify({"success": False, "error": str(e), "status_code": 500}), 500

# === HELPER FUNCTIONS ===
def calculate_dynamic_fare(base_fare):
    """Apply dynamic pricing based on demand"""
    import random
    # In real implementation, check booking velocity
    surge = random.choice([0, 0, 0, 50, 100, 200])  # 50% chance of surge
    return float(base_fare) + surge

def get_concession_percent(concession_type):
    """Get discount percentage for concession type"""
    concessions = {
        'General': 0,
        'Senior': 40,
        'Student': 50,
        'Disabled': 50,
        'Armed Forces': 50
    }
    return concessions.get(concession_type, 0)

def get_surge_multiplier(journey_date):
    """Calculate surge based on how close journey date is"""
    if not journey_date:
        return 1.0
    
    from datetime import datetime
    journey = datetime.strptime(journey_date, '%Y-%m-%d')
    today = datetime.now()
    days_diff = (journey - today).days
    
    if days_diff < 2:
        return 2.0  # 2x surge for last minute
    elif days_diff < 7:
        return 1.5
    elif days_diff < 30:
        return 1.2
    return 1.0


# ==================== AUTH ====================

def hash_password(password):
    """Simple SHA-256 hash. Replace with bcrypt in production."""
    return hashlib.sha256(password.encode()).hexdigest()

# ==================== ROLE HELPERS ====================

ADMIN_EMAIL   = 'admin@admin.com'
ADMIN_DOMAIN  = 'admin.com'      # any @admin.com email gets Admin role

def is_admin_email(email: str) -> bool:
    """Returns True for admin@admin.com OR any *@admin.com address."""
    e = (email or '').strip().lower()
    return e == ADMIN_EMAIL or e.endswith('@' + ADMIN_DOMAIN)

def resolve_role(user_record):
    """
    Determine canonical role for a user record.
    Priority:
      1. Any @admin.com email  → 'Admin'  (covers admin@admin.com, test@admin.com, etc.)
      2. Role field == 'Admin' → 'Admin'
      3. Everything else       → 'User'     
    """
    email = (user_record.get('Email') or '').strip().lower()
    if is_admin_email(email):
        return 'Admin'
    role = (user_record.get('Role') or '').strip()
    return role if role in ('Admin', 'User') else 'User'

def require_admin(f):
    """Decorator: blocks non-admin callers on sensitive endpoints."""
    @wraps(f)
    def decorated(*args, **kwargs):
        # Simple header-based check: frontend sends X-User-Email on admin calls
        caller_email = request.headers.get('X-User-Email', '').strip().lower()
        caller_role  = request.headers.get('X-User-Role',  '').strip()
        if not is_admin_email(caller_email) and caller_role.lower() != 'admin':
            return jsonify({'success': False, 'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated

# ==================== AUTH ====================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    is_valid, missing = validate_required(data, ['Full_Name', 'Email', 'Password'])
    if not is_valid:
        return jsonify({'success': False, 'error': f'Missing fields: {", ".join(missing)}'}), 400

    email = (data.get('Email') or '').strip().lower()

    # ── @admin.com emails register normally but get Role='Admin' ───────────────
    # No secret key needed — the @admin.com domain itself is the access control.

    # Check if email already exists
    existing = zoho.get_all_records(
        zoho.forms['reports']['users'],
        criteria=f'(Email == "{data["Email"]}")',
        limit=1
    )
    existing_records = existing.get('data', {}).get('data', []) if existing.get('success') else []
    if existing_records:
        return jsonify({'success': False, 'error': 'Email already registered'}), 409

    # @admin.com → Admin role, everything else → User role
    assigned_role = 'Admin' if is_admin_email(email) else 'User'
    payload = {
        'Full_Name':    data.get('Full_Name'),
        'Email':        data.get('Email'),
        'Phone_Number': data.get('Phone_Number', ''),
        'Address':      data.get('Address', ''),
        'Password':     hash_password(data.get('Password')),
        'Role':         assigned_role,
    }

    result = zoho.create_record(zoho.forms['forms']['users'], payload)
    if result.get('success'):
        return jsonify({'success': True, 'message': 'Registration successful'}), 201
    return jsonify(result), result.get('status_code', 500)


# ── POST /api/auth/setup-admin ─────────────────────────────────────────────────
@app.route('/api/auth/setup-admin', methods=['POST'])
def setup_admin():
    """
    One-time endpoint to create (or reset the password of) the admin account.

    Protected by ADMIN_SETUP_KEY environment variable — only whoever has
    access to the server environment can call this successfully.

    Body:
      {
        "setup_key":  "<value of ADMIN_SETUP_KEY env var>",
        "Full_Name":  "Admin User",        ← optional, defaults to "Admin"
        "Password":   "YourStrongPass!"    ← required
      }

    Behaviour:
      • If admin@admin.com does NOT exist → creates it with Role = Admin.
      • If admin@admin.com already exists → updates the password (reset).
      • Wrong setup_key → 403 Forbidden.
      • Missing ADMIN_SETUP_KEY env var → 503 (setup not enabled).

    Set in .env / Railway environment:
      ADMIN_SETUP_KEY=some-long-random-secret-string
    """
    # ── 1. Check the env-var secret is configured ──
    setup_key_expected = os.getenv('ADMIN_SETUP_KEY', '').strip()
    if not setup_key_expected:
        return jsonify({
            'success': False,
            'error':   'Admin setup is not enabled on this server. '
                       'Set the ADMIN_SETUP_KEY environment variable to enable it.'
        }), 503

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    # ── 2. Validate the caller's setup key ──
    provided_key = (data.get('setup_key') or '').strip()
    if provided_key != setup_key_expected:
        logger.warning('setup-admin: wrong setup_key attempted')
        return jsonify({'success': False, 'error': 'Invalid setup key'}), 403

    # ── 3. Validate password ──
    password = (data.get('Password') or '').strip()
    if not password:
        return jsonify({'success': False, 'error': 'Password is required'}), 400

    full_name = (data.get('Full_Name') or 'Admin').strip()

    # ── 4. Validate and resolve target email ──
    # Accepts any @admin.com address (admin@admin.com, test@admin.com, etc.)
    # Defaults to admin@admin.com if not provided.
    target_email = (data.get('Email') or ADMIN_EMAIL).strip().lower()
    if not is_admin_email(target_email):
        return jsonify({
            'success': False,
            'error': f'Only @{ADMIN_DOMAIN} email addresses can be created via this endpoint.'
        }), 400

    # ── 5. Check if user already exists ──
    existing = zoho.get_all_records(
        zoho.forms['reports']['users'],
        criteria=f'(Email == "{target_email}")',
        limit=1
    )
    existing_records = existing.get('data', {}).get('data', []) if existing.get('success') else []

    if existing_records:
        # ── Exists → reset password + ensure Role=Admin ──
        admin_id = existing_records[0].get('ID')
        result = zoho.update_record(
            zoho.forms['reports']['users'],
            admin_id,
            {
                'Password':  hash_password(password),
                'Role':      'Admin',
                'Full_Name': full_name,
            }
        )
        if result.get('success'):
            logger.info(f'setup-admin: password reset for {target_email}')
            return jsonify({
                'success': True,
                'message': f'Admin account updated for {target_email}.',
                'action':  'updated',
                'email':   target_email,
            }), 200
        return jsonify(result), result.get('status_code', 500)

    else:
        # ── Does not exist → create with Role=Admin ──
        payload = {
            'Full_Name':    full_name,
            'Email':        target_email,
            'Password':     hash_password(password),
            'Role':         'Admin',
            'Phone_Number': data.get('Phone_Number', ''),
            'Address':      data.get('Address', ''),
        }
        result = zoho.create_record(zoho.forms['forms']['users'], payload)
        if result.get('success'):
            logger.info(f'setup-admin: created admin account {target_email}')
            return jsonify({
                'success': True,
                'message': f'Admin account created for {target_email}.',
                'action':  'created',
                'email':   target_email,
            }), 201
        return jsonify(result), result.get('status_code', 500)


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    is_valid, missing = validate_required(data, ['Email', 'Password'])
    if not is_valid:
        return jsonify({'success': False, 'error': f'Missing fields: {", ".join(missing)}'}), 400

    # Fetch user by email
    result = zoho.get_all_records(
        zoho.forms['reports']['users'],
        criteria=f'(Email == "{data["Email"]}")',
        limit=1
    )

    if not result.get('success'):
        return jsonify({'success': False, 'error': 'Auth service error'}), 500

    records = result.get('data', {}).get('data', [])
    if not records:
        return jsonify({'success': False, 'error': 'Invalid email or password'}), 401

    user = records[0]
    stored_hash = user.get('Password', '')
    input_hash  = hash_password(data['Password'])

    if stored_hash != input_hash:
        return jsonify({'success': False, 'error': 'Invalid email or password'}), 401

    # Resolve role: admin@admin.com always gets 'Admin' regardless of Zoho Role field
    canonical_role = resolve_role(user)

    return jsonify({
        'success': True,
        'message': 'Login successful',
        'user': {
            'ID':           user.get('ID'),
            'Full_Name':    user.get('Full_Name'),
            'Email':        user.get('Email'),
            'Phone_Number': user.get('Phone_Number'),
            'Address':      user.get('Address'),
            'Role':         canonical_role,   # FIXED: always canonical
        }
    }), 200

# ==================== MAIN ====================

if __name__ == '__main__':
    listen_port = int(os.getenv('X_ZOHO_CATALYST_LISTEN_PORT', 9000))
    debug_mode = os.getenv('FLASK_ENV') == 'development'
    
    logger.info(f"Starting Railway Ticketing System on port {listen_port}")
    app.run(host='0.0.0.0', port=listen_port, debug=debug_mode)