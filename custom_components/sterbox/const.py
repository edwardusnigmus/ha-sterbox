"""Stałe integracji Sterbox."""

DOMAIN = "sterbox"

CONF_NAME     = "name"
CONF_HOST     = "host"
CONF_PASSWORD = "password"
CONF_INTERVAL   = "interval"
CONF_REST_DELAY    = "rest_delay"    # pauza między paczkami (sekundy)
CONF_REAUTH_INTERVAL = "reauth_interval"  # proaktywny re-auth (minuty, 0=wyłączone)
DEFAULT_REAUTH_INTERVAL = 45  # 45 minut domyślnie
CONF_FAILURE_THRESHOLD   = "failure_threshold"  # ile błędów zanim unavailable
DEFAULT_FAILURE_THRESHOLD = 3  # domyślnie 3 cykle
CONF_VARS     = "vars"

# Pola pojedynczej zmiennej
VAR_NAME         = "name"
VAR_CIRCUIT      = "circuit"
VAR_QUERY        = "query"
VAR_ENTITY_TYPE  = "entity_type"
VAR_UNIT         = "unit"
VAR_MIN          = "min"
VAR_MAX          = "max"
VAR_STEP         = "step"
VAR_NUMBER_MODE  = "number_mode"  # "slider" lub "box"
VAR_ENTITY_ID    = "entity_id_suffix"
VAR_ICON         = "icon"  # opcjonalna ikona MDI np. mdi:lightbulb  # opcjonalny suffix entity_id
VAR_PRECISION    = "precision"  # suggested_display_precision dla sensor
VAR_BUTTON_VALUE = "button_value"
VAR_DEVICE_CLASS = "device_class"
VAR_STATE_CLASS  = "state_class"

# Pola cover (roleta)
VAR_COVER_UP       = "up"        # obwód góra @scd
VAR_COVER_DOWN     = "down"      # obwód dół @scd
VAR_COVER_STOP     = "stop"      # obwód stop @scd (opcjonalne)
VAR_COVER_STATE_UP = "state_up"  # krańcówka góra @gcd (opcjonalne)
VAR_COVER_STATE_DN = "state_dn"  # krańcówka dół @gcd (opcjonalne)
VAR_COVER_DEVICE_CLASS = "cover_device_class"  # typ rolety
VAR_COVER_VAL_UP   = "val_up"    # wartość wysyłana przy góra (0/1/2)
VAR_COVER_VAL_DOWN = "val_down"  # wartość wysyłana przy dół (0/1/2)
VAR_COVER_VAL_STOP = "val_stop"  # wartość wysyłana przy stop (0/1/2)

# Typy obwodów
CIRCUIT_GCA = "gca"
CIRCUIT_GCD = "gcd"
CIRCUIT_SCA = "sca"
CIRCUIT_SCD = "scd"

READ_CIRCUITS  = (CIRCUIT_GCA, CIRCUIT_GCD)
WRITE_CIRCUITS = (CIRCUIT_SCA, CIRCUIT_SCD)

# Typy encji
ENTITY_SENSOR        = "sensor"
ENTITY_BINARY_SENSOR = "binary_sensor"
ENTITY_SWITCH        = "switch"
ENTITY_BUTTON        = "button"
ENTITY_NUMBER        = "number"
ENTITY_COVER         = "cover"
ENTITY_SWITCH_FB     = "switch_fb"  # switch z potwierdzeniem stanu

PLATFORMS = [
    ENTITY_SENSOR,
    ENTITY_BINARY_SENSOR,
    ENTITY_SWITCH,
    ENTITY_BUTTON,
    ENTITY_NUMBER,
    ENTITY_COVER,
]

MAX_VARS_PER_REQUEST = 35
DEFAULT_INTERVAL     = 1
DEFAULT_REST_DELAY   = 0.1  # 100ms domyślnie
DEFAULT_TIMEOUT      = 5
DEFAULT_AUTH_RETRY_DELAY       = 2
DEFAULT_MAX_CONNECTION_RETRIES = 5
DEFAULT_CONNECTION_RETRY_DELAY = 5

# Sensor device_class → (domyślna jednostka, state_class)
SENSOR_DEVICE_CLASSES = {
    "":            ("",      "measurement"),
    "temperature": ("°C",    "measurement"),
    "humidity":    ("%",     "measurement"),
    "power":       ("W",     "measurement"),
    "energy":      ("kWh",   "total_increasing"),
    "voltage":     ("V",     "measurement"),
    "current":     ("A",     "measurement"),
    "pressure":    ("hPa",   "measurement"),
    "illuminance": ("lx",    "measurement"),
    "co2":         ("ppm",   "measurement"),
    "pm25":        ("µg/m³", "measurement"),
    "frequency":   ("Hz",    "measurement"),
    "speed":       ("m/s",   "measurement"),
    "volume":      ("m³",    "total_increasing"),
    "gas":         ("m³",    "total_increasing"),
    "water":       ("L",     "total_increasing"),
}

BINARY_SENSOR_DEVICE_CLASSES = [
    "", "door", "window", "motion", "presence", "occupancy",
    "lock", "plug", "smoke", "moisture", "heat", "cold",
    "light", "problem", "running", "safety", "tamper",
    "vibration", "power", "opening",
]

# Switch z feedbackiem
ENTITY_SWITCH_FB    = "switch_fb"    # switch z potwierdzeniem @gcd
VAR_FEEDBACK_QUERY  = "feedback_query"   # obwód potwierdzenia @gcd
VAR_FEEDBACK_TIMEOUT = "feedback_timeout"  # timeout w sekundach

# Grupowanie zmiennych
VAR_GROUP  = "group"
CONF_GROUPS = "groups"  # lista nazw grup dla instancji

# Priorytety odpytywania
VAR_PRIORITY = "priority"
PRIORITY_HIGH   = "high"
PRIORITY_MEDIUM = "medium"
PRIORITY_LOW    = "low"
PRIORITY_DEFAULT = PRIORITY_HIGH

# Interwały dla priorytetów — klucze w konfiguracji
CONF_INTERVAL_HIGH   = "interval_high"
CONF_INTERVAL_MEDIUM = "interval_medium"
CONF_INTERVAL_LOW    = "interval_low"

DEFAULT_INTERVAL_HIGH   = 1
DEFAULT_INTERVAL_MEDIUM = 5
DEFAULT_INTERVAL_LOW    = 10
