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
            'settings':     os.getenv('ZOHO_REPORT_SETTINGS',     'All_Settings'),
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

            params = {"limit": limit}

            if criteria:
                params["criteria"] = criteria

            return self._request(
                "GET",
                url,
                params=params
            )

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

        try:
            url = self._get_url("report", report_name, record_id)

            payload = {
                "data": data
            }

            return self._request(
                "PATCH",
                url,
                json=payload
            )

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
    source       = request.args.get('source')        # From station code, e.g. "MAS"
    destination  = request.args.get('destination')   # To station code, e.g. "NDLS"
    journey_date = request.args.get('journey_date')  # "DD-MMM-YYYY" e.g. "10-Mar-2026"

    criteria_parts = []

    # From_Station / To_Station are lookup fields — filter via linked Station_Code subfield
    if source:
        criteria_parts.append(f'(From_Station.Station_Code == "{source}")')

    if destination:
        criteria_parts.append(f'(To_Station.Station_Code == "{destination}")')

    criteria = ' && '.join(criteria_parts) if criteria_parts else None

    result = zoho.get_all_records(
        zoho.forms['reports']['trains'],
        criteria=criteria,
        limit=limit
    )
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
        return jsonify({
            'success': False,
            'error': 'No data provided'
        }), 400

    # Build payload explicitly so all fields are properly mapped
    payload = {
        "Train_Number":   data.get("Train_Number") or data.get("train_number"),
        "Train_Name":     data.get("Train_Name")   or data.get("train_name"),
        "Train_Type":     data.get("Train_Type")   or data.get("train_type"),
        "From_Station":   extract_lookup_id(data.get("From_Station")),
        "To_Station":     extract_lookup_id(data.get("To_Station")),
        "Departure_Time": data.get("Departure_Time"),
        "Arrival_Time":   data.get("Arrival_Time"),
        "Duration":       data.get("Duration")       or None,
        "Distance":       data.get("Distance")       or None,
        "Fare_SL":        float(data.get("Fare_SL")  or 0),
        "Fare_3A":        float(data.get("Fare_3A")  or 0),
        "Fare_2A":        float(data.get("Fare_2A")  or 0),
        "Fare_1A":        float(data.get("Fare_1A")  or 0),
        "Fare_CC":        float(data.get("Fare_CC")  or 0),
        "Fare_EC":        float(data.get("Fare_EC")  or 0),
        "Fare_2S":        float(data.get("Fare_2S")  or 0),
        "Total_Seats_SL": int(data.get("Total_Seats_SL")  or 0),
        "Total_Seats_3A": int(data.get("Total_Seats_3A")  or 0),
        "Total_Seats_2A": int(data.get("Total_Seats_2A")  or 0),
        "Total_Seats_1A": int(data.get("Total_Seats_1A")  or 0),
        "Total_Seats_CC": int(data.get("Total_Seats_CC")  or 0),
        "Run_Days":       data.get("Run_Days")       or None,
        "Is_Active":      data.get("Is_Active", True),
    }
    # Remove None values
    payload = {k: v for k, v in payload.items() if v is not None}

    result = zoho.update_record(
        zoho.forms['reports']['trains'],
        train_id,
        payload
    )

    return jsonify(result), result.get('status_code', 200)

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

    # Extract passengers safely
    passengers = data.get("Passengers")
    if isinstance(passengers, str):
        passengers = json.loads(passengers)

    def _safe_lookup_id(val):
        if isinstance(val, dict):
            return val.get("ID") or val.get("id")
        return val

    # Passengers: accept JSON string or list
    passengers_raw = data.get("Passengers", [])
    if isinstance(passengers_raw, list):
        passengers_str = json.dumps(passengers_raw)
    else:
        passengers_str = passengers_raw  # already a string

    pnr = data.get("PNR") or ("PNR" + uuid.uuid4().hex[:8].upper())

    payload = {
        "Class":            data.get("Class"),
        "Journey_Date":     data.get("Journey_Date"),
        "PNR":              pnr,
        "Passenger_Count":  int(data.get("Passenger_Count") or 0),
        "Passengers":       passengers_str,
        "Quota":            data.get("Quota", "General"),
        "Booking_Status":   data.get("Booking_Status", "pending"),
        "Payment_Status":   data.get("Payment_Status", "unpaid"),
        "Total_Fare":       float(data.get("Total_Fare") or 0),
        "Booking_Time":     data.get("Booking_Time") or datetime.now().strftime("%d-%b-%Y %H:%M:%S"),
        "Trains":           _safe_lookup_id(data.get("Trains")),
        "Users":            _safe_lookup_id(data.get("Users")),
    }
    # Remove None values — Zoho rejects explicit null for lookup fields
    payload = {k: v for k, v in payload.items() if v is not None and v != ""}

    result = zoho.create_record(zoho.forms['forms']['bookings'], payload)
    if result.get('success'):
        result['data'] = result.get('data', {})
        result['data']['PNR'] = pnr
    return jsonify(result), result.get('status_code', 200)

@app.route('/api/bookings', methods=['GET'])
def get_bookings():
    limit = request.args.get('limit', 200, type=int)
    user_id = request.args.get('user_id')
    status = request.args.get('status')
    journey_date = request.args.get('journey_date')

    criteria_parts = []
    if user_id:
        # Zoho lookup field is "Users", not "User_ID"
        criteria_parts.append(f'(Users == "{user_id}")')
    if status:
        criteria_parts.append(f'(Booking_Status == "{status}")')
    if journey_date:
        criteria_parts.append(f'(Journey_Date == "{journey_date}")')

    criteria = ' && '.join(criteria_parts) if criteria_parts else None

    result = zoho.get_all_records(zoho.forms['reports']['bookings'], criteria=criteria, limit=limit)
    return jsonify(result), result.get('status_code', 200)

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
    """GET /api/users/{userId}/bookings  — all or upcoming bookings for a user.
    Query params:
      upcoming=true   → only bookings where Journey_Date >= today
      status=confirmed|cancelled|pending
    """
    upcoming_only = request.args.get('upcoming', '').lower() == 'true'
    status_filter = request.args.get('status')

    criteria_parts = [f'(Users == "{user_id}")']

    if status_filter:
        criteria_parts.append(f'(Booking_Status == "{status_filter}")')

    criteria = ' && '.join(criteria_parts)

    result = zoho.get_all_records(
        zoho.forms['reports']['bookings'],
        criteria=criteria,
        limit=500
    )

    if not result.get('success'):
        return jsonify(result), result.get('status_code', 500)

    records = result.get('data', {}).get('data', [])

    # Apply upcoming filter in Python (Zoho date comparison is limited)
    if upcoming_only:
        today = datetime.now().strftime('%Y-%m-%d')
        def is_upcoming(b):
            jd = b.get('Journey_Date', '')
            if not jd:
                return False
            # Parse "DD-MMM-YYYY HH:MM:SS" or "YYYY-MM-DD"
            try:
                if '-' in jd and len(jd.split('-')[0]) == 4:
                    return jd[:10] >= today
                dt = datetime.strptime(jd.split(' ')[0], '%d-%b-%Y')
                return dt.strftime('%Y-%m-%d') >= today
            except Exception:
                return False
        records = [b for b in records if is_upcoming(b)]

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
        route_result = zoho.get_all_records(
            zoho.forms['reports']['train_routes'],
            criteria=f'(Train_ID == "{train_id}")',
            limit=100
        )
        if route_result.get('success'):
            routes = route_result.get('data', {}).get('data', [])
            if routes:
                # Sort by sequence
                routes.sort(key=lambda r: int(r.get('Sequence', 0)))
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
        'sleeper': 'SL', 'sl': 'SL',
        '3ac': '3AC', '3a': '3AC',
        '2ac': '2AC', '2a': '2AC',
        '1ac': '2AC', '1a': '2AC',  # fallback to 2AC bucket
        'cc': 'SL',
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

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    is_valid, missing = validate_required(data, ['Full_Name', 'Email', 'Password'])
    if not is_valid:
        return jsonify({'success': False, 'error': f'Missing fields: {", ".join(missing)}'}), 400

    # Check if email already exists
    existing = zoho.get_all_records(
        zoho.forms['reports']['users'],
        criteria=f'(Email == "{data["Email"]}")',
        limit=1
    )
    existing_records = existing.get('data', {}).get('data', []) if existing.get('success') else []
    if existing_records:
        return jsonify({'success': False, 'error': 'Email already registered'}), 409

    payload = {
        'Full_Name':    data.get('Full_Name'),
        'Email':        data.get('Email'),
        'Phone_Number': data.get('Phone_Number', ''),
        'Address':      data.get('Address', ''),
        'Password':     hash_password(data.get('Password')),
        'Role':         data.get('Role', 'User'),
    }

    result = zoho.create_record(zoho.forms['forms']['users'], payload)
    if result.get('success'):
        return jsonify({'success': True, 'message': 'Registration successful'}), 201
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

    return jsonify({
        'success': True,
        'message': 'Login successful',
        'user': {
            'ID':           user.get('ID'),
            'Full_Name':    user.get('Full_Name'),
            'Email':        user.get('Email'),
            'Phone_Number': user.get('Phone_Number'),
            'Address':      user.get('Address'),
            'Role':         user.get('Role', 'User'),
        }
    }), 200



# ==================== MAIN ====================

if __name__ == '__main__':
    listen_port = int(os.getenv('X_ZOHO_CATALYST_LISTEN_PORT', 9000))
    debug_mode = os.getenv('FLASK_ENV') == 'development'
    
    logger.info(f"Starting Railway Ticketing System on port {listen_port}")
    app.run(host='0.0.0.0', port=listen_port, debug=debug_mode)