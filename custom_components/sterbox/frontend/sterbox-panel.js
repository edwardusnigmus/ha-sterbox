/**
 * Sterbox Panel v10
 * - Używa WebSocket API sterbox/* zamiast config_entries/list
 * - Odporny na przeładowanie integracji (auto-retry _load po reloadzie)
 * - Pokazuje spinner podczas reload i odświeża po zakończeniu
 */

const CIRCUITS = {
  gca: { label: "Odczyt analogowy @gca → sensor",       entity_type: "sensor" },
  gcd: { label: "Odczyt cyfrowy @gcd → binary_sensor",  entity_type: "binary_sensor" },
  scd: { label: "Zapis cyfrowy @scd → switch / button", entity_type: "switch" },
  sca: { label: "Zapis analogowy @sca → number",        entity_type: "number" },
};

const READ_CIRCUITS  = ["gca", "gcd"];
const COVER_TYPE = "cover";
const COVER_DEVICE_CLASSES = [
  { value: "blind",   label: "Roleta" },
  { value: "shutter", label: "Okiennica" },
  { value: "curtain", label: "Zasłona/firanka" },
  { value: "awning",  label: "Markiza" },
  { value: "shade",   label: "Żaluzja" },
  { value: "garage",  label: "Brama garażowa" },
  { value: "gate",    label: "Brama wjazdowa" },
];

/** Slugify — tak samo jak HA buduje entity_id */
function slugify(text) {
  return (text || "")
    .toLowerCase()
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e")
    .replace(/ł/g,"l").replace(/ń/g,"n").replace(/ó/g,"o")
    .replace(/ś/g,"s").replace(/ź/g,"z").replace(/ż/g,"z")
    .replace(/[^a-z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"");
}

function buildEntityId(domain, deviceName, entityName, customSuffix) {
  const suffix = customSuffix?.trim() || slugify(entityName);
  const device = slugify(deviceName);
  return `${domain}.${device}_${suffix}`;
}
const PRIORITIES = {
  high:   "Wysoki",
  medium: "Średni",
  low:    "Niski",
};
const WRITE_CIRCUITS = ["sca", "scd"];

const SENSOR_DEVICE_CLASSES = {
  "":                      { label: "Ogólny sensor",              unit: "",       state_class: "measurement" },
  // Temperatura i wilgotność
  "temperature":           { label: "Temperatura",                unit: "°C",     state_class: "measurement" },
  "humidity":              { label: "Wilgotność powietrza",       unit: "%",      state_class: "measurement" },
  "absolute_humidity":     { label: "Wilgotność bezwzgl.",        unit: "g/m³",   state_class: "measurement" },
  "moisture":              { label: "Wilgotność materiału",       unit: "%",      state_class: "measurement" },
  // Elektryczne
  "power":                 { label: "Moc",                        unit: "W",      state_class: "measurement" },
  "energy":                { label: "Energia",                    unit: "kWh",    state_class: "total_increasing" },
  "energy_storage":        { label: "Energia (magazyn)",          unit: "kWh",    state_class: "measurement" },
  "voltage":               { label: "Napięcie",                   unit: "V",      state_class: "measurement" },
  "current":               { label: "Prąd",                       unit: "A",      state_class: "measurement" },
  "apparent_power":        { label: "Moc pozorna",                unit: "VA",     state_class: "measurement" },
  "reactive_power":        { label: "Moc bierna",                 unit: "var",    state_class: "measurement" },
  "power_factor":          { label: "Współczynnik mocy",          unit: "%",      state_class: "measurement" },
  "frequency":             { label: "Częstotliwość",              unit: "Hz",     state_class: "measurement" },
  // Ciśnienie i atmosfera
  "pressure":              { label: "Ciśnienie",                  unit: "hPa",    state_class: "measurement" },
  "atmospheric_pressure":  { label: "Ciśnienie atm.",             unit: "hPa",    state_class: "measurement" },
  // Światło
  "illuminance":           { label: "Oświetlenie",                unit: "lx",     state_class: "measurement" },
  "irradiance":            { label: "Nasłonecznienie",            unit: "W/m²",   state_class: "measurement" },
  // Jakość powietrza
  "carbon_dioxide":        { label: "CO₂",                        unit: "ppm",    state_class: "measurement" },
  "carbon_monoxide":       { label: "CO (tlenek węgla)",          unit: "ppm",    state_class: "measurement" },
  "pm25":                  { label: "PM2.5",                      unit: "µg/m³",  state_class: "measurement" },
  "pm10":                  { label: "PM10",                       unit: "µg/m³",  state_class: "measurement" },
  "pm1":                   { label: "PM1",                        unit: "µg/m³",  state_class: "measurement" },
  "aqi":                   { label: "Indeks jakości powietrza",   unit: "",       state_class: "measurement" },
  "volatile_organic_compounds": { label: "VOC",                   unit: "µg/m³",  state_class: "measurement" },
  "ozone":                 { label: "Ozon",                       unit: "µg/m³",  state_class: "measurement" },
  "sulphur_dioxide":       { label: "SO₂",                       unit: "µg/m³",  state_class: "measurement" },
  "nitrogen_dioxide":      { label: "NO₂",                       unit: "µg/m³",  state_class: "measurement" },
  // Ruch i prędkość
  "speed":                 { label: "Prędkość",                   unit: "m/s",    state_class: "measurement" },
  "wind_speed":            { label: "Prędkość wiatru",            unit: "m/s",    state_class: "measurement" },
  "wind_direction":        { label: "Kierunek wiatru",            unit: "°",      state_class: "measurement" },
  // Objętość i przepływ
  "volume":                { label: "Objętość",                   unit: "m³",     state_class: "total_increasing" },
  "volume_flow_rate":      { label: "Przepływ",                   unit: "m³/h",   state_class: "measurement" },
  "volume_storage":        { label: "Objętość (magazyn)",         unit: "L",      state_class: "measurement" },
  // Media
  "gas":                   { label: "Gaz",                        unit: "m³",     state_class: "total_increasing" },
  "water":                 { label: "Woda",                       unit: "m³",     state_class: "total_increasing" },
  "energy_distance":       { label: "Zużycie energii/km",         unit: "kWh/100km", state_class: "measurement" },
  // Pozostałe fizyczne
  "battery":               { label: "Bateria",                    unit: "%",      state_class: "measurement" },
  "distance":              { label: "Dystans",                    unit: "m",      state_class: "measurement" },
  "weight":                { label: "Masa/waga",                  unit: "kg",     state_class: "measurement" },
  "area":                  { label: "Powierzchnia",               unit: "m²",     state_class: "measurement" },
  "duration":              { label: "Czas trwania",               unit: "s",      state_class: "measurement" },
  "precipitation":         { label: "Opady",                      unit: "mm",     state_class: "total_increasing" },
  "precipitation_intensity": { label: "Intensywność opadów",      unit: "mm/h",   state_class: "measurement" },
  "sound_pressure":        { label: "Poziom dźwięku",             unit: "dB",     state_class: "measurement" },
  "signal_strength":       { label: "Siła sygnału",               unit: "dBm",    state_class: "measurement" },
  "ph":                    { label: "pH",                         unit: "",       state_class: "measurement" },
  // Dane
  "data_rate":             { label: "Przepustowość danych",       unit: "Mbit/s", state_class: "measurement" },
  "data_size":             { label: "Rozmiar danych",             unit: "GB",     state_class: "measurement" },
  // Finansowe
  "monetary":              { label: "Wartość pieniężna",          unit: "",       state_class: "total" },
};

const BINARY_DEVICE_CLASSES = [
  { value: "",              label: "Ogólny (ON/OFF)" },
  // Otwarcia i zamknięcia
  { value: "door",          label: "Drzwi (otwarte/zamknięte)" },
  { value: "window",        label: "Okno (otwarte/zamknięte)" },
  { value: "opening",       label: "Otwarcie (otwarte/zamknięte)" },
  { value: "garage_door",   label: "Brama garażowa" },
  // Ruch i obecność
  { value: "motion",        label: "Ruch (wykryto/brak)" },
  { value: "presence",      label: "Obecność (jest/brak)" },
  { value: "occupancy",     label: "Zajętość (zajęte/wolne)" },
  // Bezpieczeństwo
  { value: "lock",          label: "Zamek (zamknięty/otwarty)" },
  { value: "safety",        label: "Bezpieczeństwo (bezpieczny/niebezp.)" },
  { value: "tamper",        label: "Ingerencja (wykryto/brak)" },
  { value: "problem",       label: "Problem/alarm (alarm/OK)" },
  // Zagrożenia
  { value: "smoke",         label: "Dym (wykryto/brak)" },
  { value: "carbon_monoxide", label: "CO (wykryto/brak)" },
  { value: "gas",           label: "Gaz (wykryto/brak)" },
  { value: "moisture",      label: "Wilgoć/zalanie (mokro/sucho)" },
  { value: "heat",          label: "Ciepło (gorąco/OK)" },
  { value: "cold",          label: "Zimno (zimno/OK)" },
  { value: "fire",          label: "Pożar (wykryto/brak)" },
  { value: "flood",         label: "Powódź (wykryto/brak)" },
  // Urządzenia i zasilanie
  { value: "plug",          label: "Wtyczka (podłączona/nie)" },
  { value: "power",         label: "Zasilanie (jest/brak)" },
  { value: "running",       label: "Działa/nie działa" },
  { value: "battery",       label: "Bateria (normalna/niska)" },
  { value: "battery_charging", label: "Ładowanie baterii" },
  { value: "connectivity",  label: "Połączenie (połączono/brak)" },
  // Czujniki środowiskowe
  { value: "light",         label: "Światło (jasno/ciemno)" },
  { value: "vibration",     label: "Wibracje (wykryto/brak)" },
  { value: "sound",         label: "Dźwięk (wykryto/brak)" },
  { value: "update",        label: "Aktualizacja (dostępna/brak)" },
];

class SterboxPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass      = null;
    this._instances = [];
    this._selected  = null;
    this._view      = "vars";
    this._editVar   = null;
    this._editIdx   = -1;
    this._filter    = "";
    this._filterDir = "all";
    this._loading   = false;
    this._error     = "";
    this._initialized = false;
    this._testResult  = null;
    this._editGroupIdx = -1;  // -1=nie edytujemy, >=0=edytujemy grupę
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._load();
      // Auto-refresh statusu co 5s — żeby kropka online/offline była aktualna
      setInterval(() => this._refreshStatus(), 5000);
    }
  }

  async _refreshStatus() {
    if (!this._hass || this._loading) return;
    try {
      const res = await this._hass.callWS({ type: "sterbox/get_instances" });
      const instances = res.instances || [];
      // Zaktualizuj tylko status online — bez rerenderowania całości
      let changed = false;
      for (const inst of instances) {
        const existing = this._instances.find(i => i.entry_id === inst.entry_id);
        if (existing && existing.online !== inst.online) {
          existing.online = inst.online;
          changed = true;
        }
      }
      if (changed) this._render();
    } catch(_) { /* cicho — to tylko odświeżenie statusu */ }
  }

  set panel(panel) { /* panel config — nie używamy */ }

  // ── Ładowanie danych przez WebSocket ─────────────────────────────────────

  async _load() {
    if (!this._hass) return;
    try {
      const res = await this._hass.callWS({ type: "sterbox/get_instances" });
      this._instances = res.instances || [];

      if (this._instances.length) {
        // Przywróć poprzednio wybraną instancję lub wybierz pierwszą
        const prev = this._selected?.entry_id;
        const found = prev && this._instances.find(i => i.entry_id === prev);
        const inst = found || this._instances[0];
        this._selected = JSON.parse(JSON.stringify(inst));
      } else {
        this._selected = null;
      }
      this._error = "";
    } catch(e) {
      this._error = "Błąd ładowania: " + e.message;
    }
    this._render();
  }

  _selectInstance(entryId) {
    const inst = this._instances.find(i => i.entry_id === entryId);
    if (!inst) return;
    this._selected     = JSON.parse(JSON.stringify(inst));
    this._editVar      = null;
    this._editIdx      = -1;
    this._editGroupIdx = -1;
    this._error        = "";
    this._render();
  }

  // ── Operacje na zmiennych ─────────────────────────────────────────────────

  _startAdd() {
    this._editVar = { name:"", circuit:"gca", query:"", entity_type:"sensor",
                      unit:"", min:0, max:100, step:1, button_value:1,
                      device_class:"", state_class:"measurement",
                      // cover fields
                      up:"", down:"", stop:"", state_up:"", state_dn:"", val_up:1, val_down:1, val_stop:1, cover_device_class:"blind", icon:"", feedback_query:"", feedback_timeout:5, priority:"high", group:"", number_mode:"slider", entity_id_suffix:"", precision:2 };
    this._editIdx = -1;
    this._render();
  }

  _startEdit(idx) {
    this._editVar = { ...this._selected.vars[idx] };
    this._editIdx = idx;
    this._render();
  }

  _cancelEdit() {
    this._editVar = null;
    this._editIdx = -1;
    this._render();
  }

  async _deleteVar(idx) {
    const name = this._selected.vars[idx]?.name;
    if (!confirm(`Usunąć zmienną "${name}"?\nEncja zostanie usunięta z HA.`)) return;
    const vars = [...this._selected.vars];
    vars.splice(idx, 1);
    await this._saveVars(vars);
  }

  _buildVar() {
    const v = this._editVar;
    // Zachowaj priority i group we wszystkich typach
    const _priority = v.priority || "high";
    const _group    = v.group?.trim() || "";

    if (!v.name.trim()) { this._error = "Nazwa nie może być pusta"; this._render(); return null; }
    const dup = this._selected.vars.findIndex((x,i) => x.name === v.name.trim() && i !== this._editIdx);
    if (dup >= 0) { this._error = "Zmienna o tej nazwie już istnieje"; this._render(); return null; }
    this._error = "";

    // Cover — walidacja pól cover (nie ma query)
    // Cover — specjalny typ grupowy, nie ma circuit/query jak inne zmienne
    if (v.entity_type === COVER_TYPE) {
      if (!v.up.trim())   { this._error = "Obwód góra nie może być pusty";  this._render(); return null; }
      if (!v.down.trim()) { this._error = "Obwód dół nie może być pusty";   this._render(); return null; }
      return {
        name:       v.name.trim(),
        entity_type: COVER_TYPE,
        up:          v.up.trim(),
        down:        v.down.trim(),
        stop:        v.stop?.trim() || "",
        state_up:    v.state_up?.trim() || "",
        state_dn:    v.state_dn?.trim() || "",
        val_up:            parseInt(v.val_up)   || 1,
        val_down:          parseInt(v.val_down) || 1,
        val_stop:          parseInt(v.val_stop) || 1,
        cover_device_class: v.cover_device_class || "blind",
        priority:          _priority,
        group:             _group,
      };
    }

    // Walidacja query tylko dla zwykłych zmiennych (cover ma własne pola)
    if (!v.query?.trim()) { this._error = "Zapytanie nie może być puste"; this._render(); return null; }

    const circuit = v.circuit;
    const entity_type = circuit === "scd" ? (v.entity_type || "switch") : CIRCUITS[circuit].entity_type;
    const cleaned = { name: v.name.trim(), circuit, query: v.query.trim(), entity_type };

    // Ikona MDI — dla zapisu cyfrowego i analogowego
    if (circuit === "scd" || circuit === "sca") {
      if (v.icon?.trim()) cleaned.icon = v.icon.trim();
      // Zapis nie ma priorytetu — leci natychmiast przy akcji
      delete cleaned.priority;
    }

    // Switch z feedbackiem — zapisz feedback_query i timeout
    if (entity_type === "switch_fb") {
      cleaned.feedback_query   = v.feedback_query?.trim() || "";
      cleaned.feedback_timeout = parseFloat(v.feedback_timeout) || 5;
    }

    cleaned.priority       = _priority;
    cleaned.group          = _group;
    // entity_id_suffix — tylko przy nowej encji (editIdx < 0 to sprawdza JS przy zapisie)
    if (v.entity_id_suffix !== undefined) {
      cleaned.entity_id_suffix = v.entity_id_suffix?.trim() || slugify(v.name.trim());
    }
    // precision — tylko dla sensor
    if (circuit === "gca" && v.precision !== undefined && v.precision !== "") {
      cleaned.precision = parseInt(v.precision) ?? 2;
    }

    if (circuit === "gca") {
      cleaned.device_class = v.device_class || "";
      cleaned.state_class  = v.state_class  || "measurement";
      const dcInfo = SENSOR_DEVICE_CLASSES[v.device_class] || {};
      cleaned.unit = (v.unit !== undefined && v.unit !== "") ? v.unit : (dcInfo.unit || "");
    }
    if (circuit === "gcd") {
      cleaned.device_class = v.device_class || "";
    }
    if (circuit === "sca") {
      cleaned.number_mode = v.number_mode || "slider";
      if (cleaned.number_mode === "slider") {
        cleaned.min  = parseFloat(v.min)  || 0;
        cleaned.max  = parseFloat(v.max)  || 100;
        cleaned.step = parseFloat(v.step) || 1;
      } else {
        // Tryb box — min/max opcjonalne
        if (v.min !== "" && v.min !== undefined) cleaned.min = parseFloat(v.min) || 0;
        if (v.max !== "" && v.max !== undefined) cleaned.max = parseFloat(v.max) || 0;
        cleaned.step = parseFloat(v.step) || 0.01;
      }
    }
    if (circuit === "scd" && entity_type === "button") {
      cleaned.button_value = parseInt(v.button_value) ?? 1;
    }
    return cleaned;
  }

  async _saveEditVar() {
    const cleaned = this._buildVar();
    if (!cleaned) return;
    const vars = [...this._selected.vars];
    if (this._editIdx >= 0) vars[this._editIdx] = cleaned;
    else vars.push(cleaned);
    await this._saveVars(vars);
  }

  async _saveVars(vars) {
    this._loading = true;
    this._editVar = null;
    this._editIdx = -1;
    this._render();
    try {
      const res = await this._hass.callWS({
        type:     "sterbox/update_vars",
        entry_id: this._selected.entry_id,
        vars,
      });
      if (res.reloaded) {
        await this._waitAndReload();
      } else {
        this._selected.vars = vars;
        this._loading = false;
        await this._load();
      }
    } catch(e) {
      this._error   = "Błąd zapisu: " + e.message;
      this._loading = false;
      this._render();
    }
  }


  async _testConnection() {
    this._testResult = null;
    this._loading    = true;
    this._render();
    try {
      this._testResult = await this._hass.callWS({
        type:     "sterbox/test_connection",
        entry_id: this._selected.entry_id,
      });
    } catch(e) {
      this._testResult = { ok: false, error: e.message };
    }
    this._loading = false;
    this._render();
  }
  async _saveDevice() {
    const sr  = this.shadowRoot;
    const get = id => sr.getElementById(id)?.value;

    // Odczytaj PRZED _render() który niszczy DOM
    const name     = get("d-name")     || this._selected?.name     || "";
    const host     = get("d-host")     || this._selected?.host     || "";
    const password = get("d-password") !== undefined && get("d-password") !== null
                     ? get("d-password") : (this._selected?.password || "");
    const ih     = parseInt(get("d-ih"))     || this._selected?.interval_high    || 1;
    const im     = parseInt(get("d-im"))     || this._selected?.interval_medium || 5;
    const il     = parseInt(get("d-il"))     || this._selected?.interval_low    || 10;
    const rd     = parseFloat(get("d-rd"))  || this._selected?.rest_delay      || 0.1;
    const reauth   = parseInt(get("d-reauth")) ?? this._selected?.reauth_interval    ?? 45;
    const failThr  = parseInt(get("d-ft"))     ?? this._selected?.failure_threshold ?? 3;

    this._loading    = true;
    this._testResult = null;
    this._render();
    try {
      const res = await this._hass.callWS({
        type:            "sterbox/update_device",
        entry_id:        this._selected.entry_id,
        name, host, password,
        interval_high:     ih,
        interval_medium:   im,
        interval_low:      il,
        rest_delay:        rd,
        reauth_interval:   reauth,
        failure_threshold: failThr,
      });
      if (res.reloaded) {
        await this._waitAndReload();
      } else {
        this._loading = false;
        await this._load();
      }
    } catch(e) {
      this._error   = "Błąd zapisu: " + e.message;
      this._loading = false;
      this._render();
    }
  }


  /**
   * Po reloadzie integracji backend potrzebuje chwili na restart.
   * Czekamy i próbujemy załadować dane kilka razy z retry.
   * POPRAWKA wg raportu: panel musi być odporny na przeładowania.
   */
  async _waitAndReload(attempts = 5, delay = 1000) {
    for (let i = 0; i < attempts; i++) {
      await new Promise(r => setTimeout(r, delay));
      try {
        const res = await this._hass.callWS({ type: "sterbox/get_instances" });
        if (res.instances && res.instances.length > 0) {
          // Zaktualizuj current_data dla wybranej instancji
          for (const inst of res.instances) {
            const existing = this._instances.find(i => i.entry_id === inst.entry_id);
            if (existing) {
              existing.online       = inst.online;
              existing.current_data = inst.current_data || {};
            }
          }
          // Odśwież current_data w _selected
          if (this._selected) {
            const fresh = res.instances.find(i => i.entry_id === this._selected.entry_id);
            if (fresh) this._selected.current_data = fresh.current_data || {};
          }
          this._instances = res.instances;
          const prev  = this._selected?.entry_id;
          const found = prev && this._instances.find(x => x.entry_id === prev);
          this._selected = JSON.parse(JSON.stringify(found || this._instances[0]));
          this._loading  = false;
          this._error    = "";
          this._render();
          return;
        }
      } catch(_) { /* jeszcze nie gotowe — spróbuj ponownie */ }
    }
    // Po wszystkich próbach — załaduj normalnie
    this._loading = false;
    await this._load();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    this.shadowRoot.innerHTML = this._css() + this._html();
    this._bind();
  }

  _css() { return `<style>
*{box-sizing:border-box;margin:0;padding:0}
:host{display:flex;height:100vh;font-family:var(--primary-font-family,sans-serif);font-size:14px;color:var(--primary-text-color);background:var(--primary-background-color)}
.sidebar{width:220px;background:var(--sidebar-background-color,var(--secondary-background-color));border-right:1px solid var(--divider-color);display:flex;flex-direction:column;flex-shrink:0}
.s-title{padding:16px 14px 8px;font-size:17px;font-weight:500}
.s-sec{padding:8px 14px 3px;font-size:10px;font-weight:600;color:var(--secondary-text-color);letter-spacing:.07em;text-transform:uppercase}
.nav{display:flex;align-items:center;gap:9px;padding:8px 10px;cursor:pointer;border-radius:8px;margin:1px 5px;font-size:13px;color:var(--secondary-text-color)}
.nav:hover,.nav.active{background:var(--primary-background-color);color:var(--primary-text-color)}
.nav.active{font-weight:500}
.nb{margin-left:auto;font-size:11px;background:var(--divider-color);border-radius:10px;padding:1px 7px}
.instances{margin-top:auto;padding:8px 5px;border-top:1px solid var(--divider-color)}
.inst{display:flex;align-items:center;gap:7px;padding:6px 8px;cursor:pointer;border-radius:6px;font-size:12px;color:var(--secondary-text-color)}
.inst:hover,.inst.active{background:var(--primary-background-color);color:var(--primary-text-color)}
.inst.active{font-weight:500}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.ok{background:#4caf50}.err{background:#f44336}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.topbar{padding:14px 18px;border-bottom:1px solid var(--divider-color);display:flex;align-items:center;gap:10px;flex-shrink:0}
.topbar h1{font-size:15px;font-weight:500;flex:1}
.toolbar{padding:9px 18px;border-bottom:1px solid var(--divider-color);display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap}
.search{position:relative;flex:1;min-width:160px;max-width:280px}
.search input{width:100%;padding:6px 10px 6px 30px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:13px}
.si{position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:15px;color:var(--secondary-text-color);pointer-events:none}
.chip{padding:5px 12px;border:1px solid var(--divider-color);border-radius:16px;background:transparent;cursor:pointer;font-size:12px;color:var(--secondary-text-color)}
.chip.active{background:var(--secondary-background-color);color:var(--primary-text-color);border-color:var(--secondary-text-color)}
.count{margin-left:auto;font-size:12px;color:var(--secondary-text-color)}
.content{flex:1;overflow-y:auto}
table{width:100%;border-collapse:collapse}
th{position:sticky;top:0;padding:7px 14px;text-align:left;font-size:11px;font-weight:600;color:var(--secondary-text-color);background:var(--secondary-background-color);border-bottom:1px solid var(--divider-color);z-index:1;text-transform:uppercase;letter-spacing:.04em}
td{padding:9px 14px;border-bottom:1px solid var(--divider-color);vertical-align:middle}
tr:hover td{background:var(--secondary-background-color)}
.badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
.br{background:#e3f2fd;color:#1565c0}.bw{background:#fce4ec;color:#880e4f}
code{font-family:monospace;font-size:12px;background:var(--secondary-background-color);padding:2px 6px;border-radius:4px;color:var(--secondary-text-color)}
.pill{font-size:11px;color:var(--secondary-text-color);padding:2px 7px;border:1px solid var(--divider-color);border-radius:10px}
.acts{display:flex;gap:3px;opacity:0}
tr:hover .acts{opacity:1}
.ib{padding:4px 8px;border:1px solid var(--divider-color);border-radius:6px;background:transparent;cursor:pointer;font-size:13px;color:var(--secondary-text-color);line-height:1}
.ib:hover{background:var(--primary-background-color);color:var(--primary-text-color)}
.ib.d:hover{color:#b71c1c;border-color:#f48fb1}
.empty{text-align:center;padding:48px;color:var(--secondary-text-color)}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 16px;border:1px solid var(--divider-color);border-radius:8px;background:transparent;cursor:pointer;font-size:13px;color:var(--primary-text-color);font-weight:500}
.btn:hover{background:var(--secondary-background-color)}
.btn-p{background:var(--primary-color,#03a9f4);color:#fff;border-color:transparent}
.btn-p:hover{opacity:.9;background:var(--primary-color,#03a9f4)}
.err-bar{background:#fce4ec;color:#b71c1c;padding:8px 18px;font-size:13px;display:flex;align-items:center;gap:8px;flex-shrink:0}
.loading{height:3px;background:var(--primary-color,#03a9f4);animation:ld 1s infinite;flex-shrink:0}
.loading-msg{padding:8px 18px;font-size:12px;color:var(--secondary-text-color);background:var(--secondary-background-color);text-align:center;flex-shrink:0}
@keyframes ld{0%{opacity:.3}50%{opacity:1}100%{opacity:.3}}
.fp{width:360px;border-left:1px solid var(--divider-color);display:flex;flex-direction:column;flex-shrink:0}
.fh{padding:13px 15px;border-bottom:1px solid var(--divider-color);font-size:14px;font-weight:500}
.fb{flex:1;overflow-y:auto;padding:14px 15px;display:flex;flex-direction:column;gap:12px}
.field{display:flex;flex-direction:column;gap:4px}
.field label{font-size:11px;font-weight:600;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.05em}
.field select,.field input{padding:7px 10px;border:1px solid var(--divider-color);border-radius:7px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:13px;width:100%}
.hint{font-size:11px;color:var(--secondary-text-color)}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
.row3 label{font-size:10px;color:var(--secondary-text-color)}
.ff{padding:11px 15px;border-top:1px solid var(--divider-color);display:flex;gap:8px}
.ff .btn{flex:1;justify-content:center}
.dform{padding:20px;max-width:440px;display:flex;flex-direction:column;gap:14px}
.sgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:20px}
.sc{border:1px solid var(--divider-color);border-radius:10px;padding:13px}
.sc h3{font-size:13px;font-weight:500;margin-bottom:7px}
.sr{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;color:var(--secondary-text-color)}
.sr span:last-child{color:var(--primary-text-color)}
.ob{color:#2e7d32;background:#e8f5e9;padding:1px 7px;border-radius:10px;font-size:11px}
.eb{color:#b71c1c;background:#fce4ec;padding:1px 7px;border-radius:10px;font-size:11px}
/* Tooltip */
.tip{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:var(--secondary-text-color);color:var(--primary-background-color);font-size:10px;font-weight:700;cursor:help;margin-left:5px;flex-shrink:0;position:relative;opacity:.7}
.tip:hover{opacity:1}
.tip::after{content:attr(data-tip);position:absolute;left:20px;top:50%;transform:translateY(-50%);background:rgba(30,30,30,.95);color:#e0e0e0;padding:5px 9px;border-radius:6px;font-size:11px;font-weight:400;white-space:pre-wrap;min-width:180px;max-width:260px;z-index:999;pointer-events:none;opacity:0;transition:opacity .15s;line-height:1.5;text-transform:none;letter-spacing:0}
.tip.tl::after{left:auto;right:20px}
.fp .tip::after{left:auto;right:20px;transform:translateY(-50%)}
.tip:hover::after{opacity:1}
/* Stopka */
.footer{padding:10px 12px;border-top:1px solid var(--divider-color);margin-top:auto;text-align:center}
.footer-logo{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:4px}
.footer-v{font-size:11px;font-weight:600;color:var(--primary-text-color)}
.footer-by{font-size:10px;color:var(--secondary-text-color)}
.footer-link{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--primary-color);text-decoration:none;margin-top:2px}
.footer-link:hover{text-decoration:underline}
</style>`; }

  _html() {
    if (!this._instances.length && !this._loading) {
      return `<div style="display:flex;align-items:center;justify-content:center;flex:1;flex-direction:column;gap:14px;color:var(--secondary-text-color)">
        <div style="margin-bottom:8px;opacity:.4"><img src="/sterbox_panel/icon.png" width="48" height="48" style="border-radius:10px"></div>
        <div style="font-size:15px;font-weight:500">${this._error || "Brak integracji Sterbox"}</div>
        <div style="font-size:13px">${this._error ? "" : "Dodaj przez Ustawienia → Integracje → Sterbox"}</div>
        <button class="btn" id="btn-reload">🔄 Odśwież</button>
      </div>`;
    }
    return `
      ${this._renderSidebar()}
      <div class="main">
        ${this._loading ? `<div class="loading"></div><div class="loading-msg">⏳ Zapisywanie zmian…</div>` : ""}
        ${this._error && !this._loading ? `<div class="err-bar">⚠ ${this._error} <span style="margin-left:auto;cursor:pointer" id="ec">✕</span></div>` : ""}
        ${!this._loading && this._view === "vars"   ? this._renderVars()   : ""}
        ${!this._loading && this._view === "device" ? this._renderDevice() : ""}
        ${!this._loading && this._view === "status" ? this._renderStatus() : ""}
        ${!this._loading && this._view === "help"   ? this._renderHelp()   : ""}
      </div>
      ${!this._loading && this._editVar !== null ? this._renderForm() : ""}
      ${this._testResult ? this._renderTestResult() : ""}`;
  }

  _renderSidebar() {
    const vars = this._selected?.vars || [];
    const instHtml = this._instances.map(inst => {
      const ok  = inst.online === true;
      const sel = this._selected?.entry_id === inst.entry_id ? "active" : "";
      return `<div class="inst ${sel}" data-entry="${inst.entry_id}">
        <div class="dot ${ok?"ok":"err"}"></div>
        <div style="flex:1;overflow:hidden">
          <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${inst.name||inst.title}</div>
          <div style="font-size:11px;opacity:.6">${inst.host}</div>
        </div>
      </div>`;
    }).join("");

    return `<div class="sidebar">
      <div class="s-title"><img src="/sterbox_panel/icon.png" width="22" height="22" style="border-radius:4px;vertical-align:middle;margin-right:6px"> Sterbox</div>
      <div class="s-sec">Instancje</div>
      ${instHtml}
      <div class="s-sec" style="margin-top:8px">Panel</div>
      ${[["vars","Zmienne",vars.length],["device","Urządzenie",null],["status","Status",null],["help","Pomoc",null]].map(([v,label,badge]) =>
        `<div class="nav ${this._view===v?"active":""}" data-view="${v}">${label}${badge!==null?`<span class="nb">${badge}</span>`:""}</div>`
      ).join("")}
      <div class="footer">
        <div style="margin-bottom:6px"><img src="/sterbox_panel/icon.png" width="32" height="32" style="border-radius:6px"></div>
        <div class="footer-v">Sterbox HA API Integration</div>
        <div style="font-size:10px;color:var(--secondary-text-color);margin-bottom:2px">v1.0.3</div>
        <div class="footer-by">by ENIGMA</div>
        <a class="footer-link" href="https://github.com/edwardusnigmus/ha-sterbox" target="_blank">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub
        </a>
      </div>
    </div>`;
  }


  _renderVars() {
    if (!this._selected) return `<div class="empty">Wybierz instancję z listy po lewej</div>`;
    const vars = this._selected.vars || [];
    const filtered = vars.filter(v => {
      const d = this._filterDir;
      return (d==="all" || (d==="read" && READ_CIRCUITS.includes(v.circuit)) || (d==="write" && WRITE_CIRCUITS.includes(v.circuit)))
        && (!this._filter || v.name.toLowerCase().includes(this._filter.toLowerCase()) || v.query.toLowerCase().includes(this._filter.toLowerCase()));
    });
    return `
      <div class="topbar">
        <h1>Zmienne — ${this._selected.name||this._selected.title}</h1>
        <button class="btn btn-p" id="btn-add">➕ Dodaj zmienną</button>
        <button class="btn" id="btn-export" title="Eksportuj zmienne do JSON">⬇ Eksport</button>
        <label class="btn" style="cursor:pointer" title="Importuj zmienne z JSON">
          ⬆ Import<input type="file" id="btn-import" accept=".json" style="display:none">
        </label>
      </div>
      <div class="toolbar">
        <div class="search"><span class="si">🔍</span>
          <input type="text" placeholder="Szukaj..." id="fi" value="${this._filter}">
        </div>
        <button class="chip ${this._filterDir==="all"?"active":""}"   data-dir="all">Wszystkie</button>
        <button class="chip ${this._filterDir==="read"?"active":""}"  data-dir="read">Odczyt</button>
        <button class="chip ${this._filterDir==="write"?"active":""}" data-dir="write">Zapis</button>
        <span class="count">${filtered.length} / ${vars.length}</span>
      </div>
      <div class="content">
        ${filtered.length ? this._tbl(filtered) : `<div class="empty">${this._filter?"Brak wyników":"Brak zmiennych — kliknij Dodaj"}</div>`}
      </div>`;
  }




  _tbl(vars) {
    // Grupuj zmienne po polu group
    const groups = {};
    vars.forEach(v => {
      const g = v.group?.trim() || "";
      if (!groups[g]) groups[g] = [];
      groups[g].push(v);
    });

    const renderRow = v => {
      const ri  = this._selected.vars.indexOf(v);
      const r   = v.entity_type === COVER_TYPE ? null : ["gca","gcd"].includes(v.circuit);
      const det = v.entity_type === "switch_fb" ? `fb: @gcd?${v.feedback_query||"—"}`
        : v.entity_type === COVER_TYPE ? `▲${v.up} ▼${v.down}${v.stop?" ■"+v.stop:""}`
        : v.unit ? v.unit + (v.device_class?` [${v.device_class}]`:"")
        : v.entity_type==="button" ? `impuls=${v.button_value??1}`
        : v.min!==undefined ? `${v.min}–${v.max}`
        : v.device_class ? v.device_class : "";
      const pri     = v.priority || "high";
      const priSec  = pri==="high"? (this._selected?.interval_high||1)
                    : pri==="medium"? (this._selected?.interval_medium||5)
                    : (this._selected?.interval_low||10);
      const priIcon = pri==="medium" ? "🟡" : pri==="low" ? "🔵" : "🔴";
      return `<tr>
        <td>${r===null?`<span class="badge" style="background:#f3e5f5;color:#6a1b9a">🪟 cover</span>`:`<span class="badge ${r?"br":"bw"}">${r?"↓ odczyt":"↑ zapis"}</span>`}</td>
        <td><strong>${v.name}</strong></td>
        <td><code>${v.entity_type===COVER_TYPE?`▲${v.up} ▼${v.down}`:`@${v.circuit}?${v.query}`}</code></td>
        <td><span class="pill">${v.entity_type}</span></td>
        <td style="font-size:12px;color:var(--secondary-text-color)">${det}</td>
        <td style="white-space:nowrap">${this._renderValueCell(v)}</td>
        <td style="white-space:nowrap;font-size:12px">${priIcon} (${priSec}s)</td>
        <td style="white-space:nowrap"><div class="acts">
          <button class="ib" data-edit="${ri}">✏️</button>
          <button class="ib d" data-del="${ri}">🗑️</button>
        </div></td>
      </tr>`;
    };

    const groupHtml = Object.entries(groups).map(([gname, gvars]) => {
      const header = gname ? `<tr><td colspan="8" style="padding:8px 14px 4px;font-size:11px;font-weight:600;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.05em;background:var(--secondary-background-color)">📁 ${gname} (${gvars.length})</td></tr>` : "";
      return header + gvars.map(renderRow).join("");
    }).join("");

    return `<table>
      <thead><tr><th>Kierunek</th><th>Nazwa</th><th>Zapytanie</th><th>Typ encji</th><th>Szczegóły</th><th>Wartość / Akcja</th><th>Interwał</th><th></th></tr></thead>
      <tbody>${groupHtml}</tbody>
    </table>`;
  }


  _renderValueCell(v) {
    const data = this._selected?.current_data || {};
    const et   = v.entity_type;
    const READ = ["gca","gcd"];

    // ── Odczyt — pokaż aktualną wartość ──────────────────────────────────
    if (READ.includes(v.circuit) && et !== "switch_fb") {
      const val = data[v.name];
      if (val === undefined || val === null) {
        return `<span style="color:var(--secondary-text-color);font-size:11px">—</span>`;
      }
      if (et === "binary_sensor") {
        const on = !!parseInt(val);
        return `<span style="font-size:13px">${on?"🟢 ON":"⚫ OFF"}</span>`;
      }
      const unit = v.unit || "";
      return `<span style="font-size:13px;font-weight:500">${val}${unit?" "+unit:""}</span>`;
    }

    // ── Switch z feedbackiem — wartość + toggle ───────────────────────────
    if (et === "switch_fb") {
      const fbVal = v.feedback_query ? data[v.name] : undefined;
      const on    = fbVal !== undefined ? !!parseInt(fbVal) : null;
      const stateIcon = on===null ? "❓" : on ? "🟢" : "⚫";
      return `<span style="font-size:12px">${stateIcon}</span>
        <button class="ib" data-write-cir="${v.circuit}" data-write-q="${v.query}" data-write-v="1" title="ON">ON</button>
        <button class="ib" data-write-cir="${v.circuit}" data-write-q="${v.query}" data-write-v="0" title="OFF">OFF</button>`;
    }

    // ── Switch zwykły ─────────────────────────────────────────────────────
    if (et === "switch") {
      return `<button class="ib" data-write-cir="${v.circuit}" data-write-q="${v.query}" data-write-v="1" title="Włącz">ON</button>
        <button class="ib" data-write-cir="${v.circuit}" data-write-q="${v.query}" data-write-v="0" title="Wyłącz">OFF</button>`;
    }

    // ── Button ────────────────────────────────────────────────────────────
    if (et === "button") {
      const bv = v.button_value ?? 1;
      return `<button class="ib" data-write-cir="${v.circuit}" data-write-q="${v.query}" data-write-v="${bv}" title="Wyślij ${bv}">▶ Wykonaj</button>`;
    }

    // ── Cover ─────────────────────────────────────────────────────────────
    if (et === "cover") {
      const upKey = `${v.name}_state_up`;
      const dnKey = `${v.name}_state_dn`;
      const isOpen   = data[upKey] ? !!parseInt(data[upKey]) : null;
      const isClosed = data[dnKey] ? !!parseInt(data[dnKey]) : null;
      const stateIcon = isOpen ? "🔓" : isClosed ? "🔒" : "❓";
      return `<span style="font-size:12px">${stateIcon}</span>
        <button class="ib" data-write-cir="scd" data-write-q="${v.up}" data-write-v="${v.val_up||1}" title="Góra">▲</button>
        ${v.stop?`<button class="ib" data-write-cir="scd" data-write-q="${v.stop}" data-write-v="${v.val_stop||1}" title="Stop">■</button>`:""}
        <button class="ib" data-write-cir="scd" data-write-q="${v.down}" data-write-v="${v.val_down||1}" title="Dół">▼</button>`;
    }

    // ── Number ────────────────────────────────────────────────────────────
    if (et === "number") {
      return `<input type="number" style="width:70px;padding:3px 6px;border:1px solid var(--divider-color);border-radius:4px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:12px"
        min="${v.min??0}" max="${v.max??100}" step="${v.step??1}" value="${v.min??0}"
        data-write-cir="${v.circuit}" data-write-q="${v.query}"
        data-number-input>`;
    }

    return "";
  }

  _renderDevice() {
    const s = this._selected || {};
    return `
      <div class="topbar"><h1>Urządzenie — ${s.name||""}</h1>
        <button class="btn btn-p" id="btn-save-dev">💾 Zapisz</button>
        <button class="btn" id="btn-test-conn">🔌 Testuj połączenie</button>
      </div>
      <div class="dform">
        <div class="field"><label>Nazwa instancji</label>
          <input type="text" id="d-name" value="${s.name||""}">
        </div>
        <div class="field"><label>Adres IP</label>
          <input type="text" id="d-host" value="${s.host||""}" placeholder="np. 10.1.0.181">
        </div>
        <div class="field"><label>Hasło autoryzacji <span class="tip" data-tip="Hasło do panelu webowego Sterboxa.
Zostaw puste jeśli Sterbox nie wymaga autoryzacji.
Puste = autoryzacja wyłączona, odczyty lecą bezpośrednio.">?</span></label>
          <input type="text" id="d-password" value="${s.password||""}" placeholder="Zostaw puste jeśli brak hasła">
          ${!s.password ? `<span class="hint" style="color:var(--warning-color,#ff9800)">⚠ Autoryzacja wyłączona — Sterbox odpytywany bez hasła</span>` : `<span class="hint" style="color:#4caf50">✓ Autoryzacja aktywna</span>`}
        </div>
        <div class="field"><label>Proaktywny re-auth (min) <span class="tip" data-tip="Co ile minut odświeżać sesję HTTP.
0 = wyłączony.
Zalecane 30-60 min jeśli sesja Sterboxa regularnie wygasa.
Re-auth i tak zawsze następuje automatycznie po błędzie.">?</span></label>
          <input type="number" id="d-reauth" value="${s.reauth_interval??45}" min="0" max="120" step="5">
        </div>
        <div style="margin-top:8px;margin-bottom:4px;font-size:11px;font-weight:600;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.05em">Interwały odpytywania <span class="tip" data-tip="Każda zmienna ma przypisany priorytet (Wysoki/Średni/Niski).
Coordinator odpytuje je z różną częstotliwością.
Wysoki: czujniki krytyczne, rolety.
Średni: czujniki pomocnicze.
Niski: rzadko zmieniające się wartości.">?</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div class="field"><label>🔴 Wysoki (s)</label>
            <input type="number" id="d-ih" value="${s.interval_high||1}" min="1" max="60">
          </div>
          <div class="field"><label>🟡 Średni (s)</label>
            <input type="number" id="d-im" value="${s.interval_medium||5}" min="1" max="300">
          </div>
          <div class="field"><label>🔵 Niski (s)</label>
            <input type="number" id="d-il" value="${s.interval_low||10}" min="1" max="3600">
          </div>
        </div>
        <div class="field" style="margin-top:8px"><label>Przerwa między paczkami (s) <span class="tip" data-tip="Pauza między kolejnymi zapytaniami HTTP.
Zwiększ do 0.2-0.5 jeśli Sterbox jest niestabilny
przy dużej liczbie zmiennych (>35).">?</span></label>
          <input type="number" id="d-rd" value="${s.rest_delay||0.1}" min="0" max="5" step="0.1">
        </div>
        <div class="field"><label>Tolerancja błędów (cykle) <span class="tip" data-tip="Ile kolejnych nieudanych odczytów zanim encje staną się niedostępne.
3 = przy interval 1s encje unavailable po ~3s przerwy.
Zwiększ aby uniknąć chwilowego unavailable podczas re-auth (2-5s).">?</span></label>
          <input type="number" id="d-ft" value="${s.failure_threshold??3}" min="1" max="30" step="1">
        </div>
        <div style="font-size:12px;color:var(--secondary-text-color);margin-top:8px">
          Zmiana IP, hasła lub interwałów spowoduje przeładowanie integracji.
        </div>
      </div>

      <div style="padding:0 20px 20px">
        <div style="margin-bottom:10px;font-size:11px;font-weight:600;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.05em">
          Grupy zmiennych
        </div>
        ${this._renderGroupsEditor()}
      </div>`;
  }

  _renderTestResult() {
    const r  = this._testResult;
    const ok = r.ok;
    // Skróć read_val — pokaż tylko pierwszą zmienną jeśli jest ich wiele
    let readVal = r.read_val || "";
    if (readVal.startsWith("{") && readVal.length > 60) {
      try {
        const obj   = JSON.parse(readVal.replace(/'/g,'"'));
        const first = Object.entries(obj)[0];
        const total = Object.keys(obj).length;
        readVal     = first ? `${first[0]}: ${first[1]}${total>1?" (+"+( total-1)+" więcej)":""}` : readVal;
      } catch(_) { readVal = readVal.substring(0,60) + "..."; }
    }
    return `<div style="
      position:fixed;bottom:24px;right:24px;z-index:999;
      min-width:260px;max-width:340px;
      padding:14px 16px;border-radius:10px;
      background:rgba(20,20,20,.95);
      color:#e0e0e0;
      font-size:13px;
      box-shadow:0 4px 20px rgba(0,0,0,.4);
      border:1px solid rgba(255,255,255,.1)
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-weight:600">${ok?"✅ Połączenie OK":"❌ Błąd połączenia"}</span>
        <span style="cursor:pointer;opacity:.5" id="test-close">✕</span>
      </div>
      ${r.response_ms!==undefined?`<div style="color:#aaa">Czas odpowiedzi: <span style="color:#fff;font-weight:500">${r.response_ms}ms</span></div>`:""}
      ${r.auth_ok!==undefined?`<div style="color:#aaa">Autoryzacja: <span style="color:${r.auth_ok?"#69f0ae":"#ff5252"}">${r.auth_ok?"✅ OK":"❌ Nieudana"}</span></div>`:""}
      ${r.read_ok!==undefined?`<div style="color:#aaa">Odczyt: <span style="color:${r.read_ok?"#69f0ae":"#ff5252"}">${r.read_ok?"✅ OK":"❌ Nieudany"}</span></div>`:""}
      ${readVal?`<div style="margin-top:6px;font-size:11px;color:#888;border-top:1px solid rgba(255,255,255,.1);padding-top:6px">Próbka: ${readVal}</div>`:""}
      ${r.error?`<div style="color:#ff5252">${r.error}</div>`:""}
    </div>`;
  }


  _renderHelp() {
    return `
      <div class="topbar"><h1>Pomoc i dokumentacja</h1></div>
      <div style="padding:24px 32px;line-height:1.6;font-size:13px;max-width:66vw">

        <div style="background:var(--secondary-background-color);padding:16px 32px;margin:0 -32px 20px;border-bottom:1px solid var(--divider-color);display:flex;align-items:center;gap:12px">
          <img src="/sterbox_panel/icon.png" width="36" height="36" style="border-radius:8px;flex-shrink:0">
          <div>
            <div style="font-weight:600;font-size:14px;margin-bottom:4px">Sterbox dla Home Assistant</div>
            <div style="color:var(--secondary-text-color);font-size:13px">Natywna integracja sterownika PLC Sterbox. Obsługuje odczyt i zapis zmiennych przez HTTP API, tworzenie encji HA oraz panel zarządzania zmiennymi.</div>
          </div>
        </div>

        <details open style="margin-bottom:12px">
          <summary style="cursor:pointer;font-weight:600;padding:8px 0">📡 Typy zmiennych</summary>
          <div style="padding:8px 0 0 12px">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <tr style="background:var(--secondary-background-color)">
                <th style="padding:6px 10px;text-align:left">Obwód</th>
                <th style="padding:6px 10px;text-align:left">Typ encji</th>
                <th style="padding:6px 10px;text-align:left">Opis</th>
              </tr>
              ${[
                ["@gca", "sensor", "Odczyt analogowy — temperatura, napięcie, itp."],
                ["@gcd", "binary_sensor", "Odczyt cyfrowy — czujnik ON/OFF"],
                ["@scd", "switch", "Zapis cyfrowy — włącz/wyłącz obwód"],
                ["@scd", "switch_fb", "Zapis cyfrowy + potwierdzenie stanu z @gcd"],
                ["@scd", "button", "Jednorazowy impuls (0/1/2=toggle)"],
                ["@sca", "number", "Zapis analogowy — wartość liczbowa"],
                ["—", "cover", "Roleta — sterowanie góra/dół + krańcówki"],
              ].map(([c,e,d])=>`<tr><td style="padding:5px 10px"><code>${c}</code></td><td style="padding:5px 10px"><span class="pill">${e}</span></td><td style="padding:5px 10px;color:var(--secondary-text-color)">${d}</td></tr>`).join("")}
            </table>
          </div>
        </details>

        <details style="margin-bottom:12px">
          <summary style="cursor:pointer;font-weight:600;padding:8px 0">🔴 Priorytety odpytywania</summary>
          <div style="padding:8px 0 0 12px;color:var(--secondary-text-color)">
            Każda zmienna ma przypisany priorytet — coordinator odpytuje Sterboxa z różną częstotliwością:<br><br>
            🔴 <b>Wysoki</b> — co <i>interval_high</i> sekund (domyślnie 1s). Dla krytycznych czujników i sterowań.<br>
            🟡 <b>Średni</b> — co <i>interval_medium</i> sekund (domyślnie 5s). Dla czujników pomocniczych.<br>
            🔵 <b>Niski</b> — co <i>interval_low</i> sekund (domyślnie 10s). Dla rzadko zmieniających się wartości.<br><br>
            Deduplikacja: ta sama zmienna w kilku miejscach (np. jako binary_sensor i stan cover) jest odpytywana tylko raz.
          </div>
        </details>

        <details style="margin-bottom:12px">
          <summary style="cursor:pointer;font-weight:600;padding:8px 0">🪟 Konfiguracja rolety</summary>
          <div style="padding:8px 0 0 12px;color:var(--secondary-text-color)">
            Roleta wymaga zdefiniowania obwodów sterowania i opcjonalnych krańcówek:<br><br>
            <b>Obwód góra/dół</b> — @scd, wartość 0/1/2 (toggle) wysyłana przy kliknięciu ▲/▼<br>
            <b>Obwód stop</b> — opcjonalny, zatrzymuje roletę<br>
            <b>Krańcówka góra/dół</b> — @gcd, coordinator odczytuje stan i aktualizuje ikonę rolety<br><br>
            Bez krańcówek: stan rolety jest nieznany (❓), przyciski zawsze aktywne (<i>assumed_state</i>).<br>
            Z krańcówkami: ikona zmienia się automatycznie gdy roleta osiągnie pozycję krańcową.
          </div>
        </details>

        <details style="margin-bottom:12px">
          <summary style="cursor:pointer;font-weight:600;padding:8px 0">🔄 Switch z feedbackiem</summary>
          <div style="padding:8px 0 0 12px;color:var(--secondary-text-color)">
            Switch z feedbackiem łączy zapis (@scd) z odczytem stanu (@gcd) w jednej encji.<br><br>
            <b>Działanie:</b> kliknięcie wysyła komendę @scd, coordinator cyklicznie odczytuje stan z @gcd
            i aktualizuje encję. Jeśli fizyczny włącznik zmieni stan — HA automatycznie to wykryje.<br><br>
            <b>Timeout = 0:</b> stan zaktualizuje się przy najbliższym cyklu odczytu.<br>
            <b>Timeout > 0:</b> po N sekundach zostanie zalogowane ostrzeżenie jeśli stan się nie zmienił.
          </div>
        </details>

        <details style="margin-bottom:12px">
          <summary style="cursor:pointer;font-weight:600;padding:8px 0">⚙️ Interwały i sesja HTTP</summary>
          <div style="padding:8px 0 0 12px;color:var(--secondary-text-color)">
            Sterbox używa sesji HTTP — po autoryzacji (u7.cgi?q0=HASLO) sesja jest ważna przez określony czas.<br><br>
            <b>Przerwa między paczkami:</b> pauza między kolejnymi zapytaniami HTTP przy >35 zmiennych.
            Zwiększ do 0.2-0.5s jeśli Sterbox jest niestabilny.<br><br>
            <b>Proaktywny re-auth:</b> co N minut odświeża sesję zanim Sterbox ją zerwie.
            Ustaw mniej niż timeout sesji Sterboxa (zwykle ~60 min).<br><br>
            Re-auth zawsze następuje automatycznie po błędzie — encje wracają po ~2 sekundach.
          </div>
        </details>

        <details style="margin-bottom:12px">
          <summary style="cursor:pointer;font-weight:600;padding:8px 0">❓ FAQ</summary>
          <div style="padding:8px 0 0 12px">
            <div style="margin-bottom:10px"><b>Encja staje się niedostępna co 1-2h</b><br>
            <span style="color:var(--secondary-text-color)">Sesja Sterboxa wygasła. Włącz proaktywny re-auth (45 min) w ustawieniach urządzenia.</span></div>
            <div style="margin-bottom:10px"><b>Panel nie odświeża się po zmianie</b><br>
            <span style="color:var(--secondary-text-color)">Wymuś odświeżenie przeglądarki: Ctrl+Shift+R. Wersja JS jest cachowana.</span></div>
            <div style="margin-bottom:10px"><b>Roleta nie reaguje na Assist ("zamknij rolety")</b><br>
            <span style="color:var(--secondary-text-color)">Przypisz encję do obszaru w HA lub dodaj alias. Upewnij się że typ rolety to "blind" (Roleta).</span></div>
            <div><b>Zmiana nazwy zmiennej tworzy nową encję</b><br>
            <span style="color:var(--secondary-text-color)">Nie — unique_id jest oparty o circuit+query, nie nazwę. Zmiana nazwy to tylko zmiana friendly_name.</span></div>
          </div>
        </details>

        <div style="margin-top:20px;padding:12px 32px;background:var(--secondary-background-color);border-top:1px solid var(--divider-color);font-size:12px;color:var(--secondary-text-color);width:100%;box-sizing:border-box;margin-left:-32px">
          Sterbox HA API Integration v1.0.3 · by ENIGMA ·
          <a href="https://github.com/edwardusnigmus/ha-sterbox" target="_blank" style="color:var(--primary-color)">GitHub</a>
        </div>

      </div>`;
  }


  _renderGroupsEditor() {
    const groups = this._selected?.groups || [];
    const rows = groups.map((g, i) => {
      const isEditing = this._editGroupIdx === i;
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:14px">📁</span>
        ${isEditing
          ? `<input type="text" id="grp-edit-${i}" value="${g}"
               style="width:160px;padding:4px 8px;border:1px solid var(--primary-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:13px">`
          : `<span style="font-size:13px;min-width:80px">${g}</span>`
        }
        ${isEditing
          ? `<button class="btn btn-p" style="padding:3px 8px;font-size:12px" data-grp-save="${i}">💾</button>
             <button class="btn" style="padding:3px 8px;font-size:12px" id="grp-cancel-btn">✕</button>`
          : `<button class="ib" style="padding:3px 6px;font-size:12px" data-grp-edit="${i}" title="Zmień nazwę">✏️</button>
             <button class="ib d" style="padding:3px 6px;font-size:12px" data-grp-del="${i}" title="Usuń">🗑️</button>`
        }
      </div>`;
    }).join("");

    return `<div>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="text" id="grp-new" placeholder="Nowa grupa..."
          style="width:180px;padding:6px 10px;border:1px solid var(--divider-color);border-radius:6px;background:var(--secondary-background-color);color:var(--primary-text-color);font-size:13px">
        <button class="btn btn-p" style="padding:6px 12px;font-size:12px" id="grp-add">➕</button>
      </div>
    </div>`;
  }

  _renderStatus() {
    return `
      <div class="topbar"><h1>Status instancji</h1>
        <button class="btn" id="btn-ref">🔄 Odśwież</button>
      </div>
      <div class="sgrid">
        ${this._instances.map(inst => {
          const ok   = inst.online === true;
          const rv   = (inst.vars||[]).filter(v=>["gca","gcd"].includes(v.circuit) || (v.entity_type==="cover" && (v.state_up||v.state_dn))).length;
          const wv   = (inst.vars||[]).filter(v=>["sca","scd"].includes(v.circuit) || v.entity_type==="cover").length;
          const auth = inst.auth_stats || {};
          return `<div class="sc">
            <h3>${inst.name||inst.title} <span class="${ok?"ob":"eb"}">${ok?"🟢 Online":"🔴 Offline"}</span></h3>
            <div class="sr"><span>Adres IP</span><span>${inst.host||"—"}</span></div>
            <div class="sr"><span>Stan HA</span><span>${inst.state||"—"}</span></div>
            <div class="sr"><span>Interwał</span><span>H:${inst.interval_high||1}s / M:${inst.interval_medium||5}s / L:${inst.interval_low||10}s</span></div>
            <div class="sr"><span>Zmiennych odczyt</span><span>${rv}</span></div>
            <div class="sr"><span>Zmiennych zapis</span><span>${wv}</span></div>
            <hr style="border:none;border-top:1px solid var(--divider-color);margin:6px 0">
            <div style="font-size:11px;font-weight:600;color:var(--secondary-text-color);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Autoryzacja</div>
            <div class="sr"><span>Ostatni re-auth</span><span style="font-weight:500">${auth.last_auth_time||"—"}</span></div>
            <div class="sr"><span>Powód</span><span>${auth.last_auth_reason||"—"}</span></div>
            <div class="sr"><span>Liczba re-auth</span><span>${auth.auth_count??0}</span></div>
            ${inst.reauth_interval > 0
              ? `<div class="sr"><span>Proaktywny co</span><span>${inst.reauth_interval} min</span></div>`
              : `<div class="sr"><span>Proaktywny</span><span style="color:var(--secondary-text-color)">wyłączony</span></div>`
            }
          </div>`;
        }).join("")}
      </div>`;
  }

  _renderForm() {
    const v    = this._editVar;
    const isNew = this._editIdx < 0;
    const isCover = v.entity_type === COVER_TYPE;
    const isScd = v.circuit === "scd";
    const isGca = v.circuit === "gca";
    const isGcd = v.circuit === "gcd";
    const isSca = v.circuit === "sca";
    const isBtn     = v.entity_type === "button";
    const isSwitchFb = v.entity_type === "switch_fb";

    return `<div class="fp">
      <div class="fh">${isNew ? "➕ Nowa zmienna" : "✏️ " + (this._selected?.vars[this._editIdx]?.name||"")}</div>
      <div class="fb">
        ${this._error ? `<div style="color:#b71c1c;font-size:12px;background:#fce4ec;padding:7px 10px;border-radius:6px">${this._error}</div>` : ""}

        <div class="field"><label>Typ encji</label>
          <select id="f-etype">
            <option value="var"   ${!isCover?"selected":""}>Pojedyncza zmienna</option>
            <option value="cover" ${isCover?"selected":""}>🪟 Roleta (cover)</option>
          </select>
        </div>

        <div class="field"><label>Nazwa</label>
          <input type="text" id="f-n" value="${v.name}" placeholder="${isCover?"np. Roleta Kuchnia":"np. temp_k"}">
          <span class="hint">Będzie friendly_name encji w HA</span>
        </div>

        ${isNew ? `
        <div class="field">
          <label style="display:flex;align-items:center;gap:6px">Entity ID
            <span style="font-size:10px;color:var(--secondary-text-color);font-weight:400">(ustalany przy pierwszym zapisie)</span>
            <span class="tip" data-tip="Unikalny adres encji w HA.
Po pierwszym zapisie nie zmienia się automatycznie.
Można zmienić ręcznie w Ustawienia → Encje.">?</span>
          </label>
          <input type="text" id="f-eid"
            value="${v.entity_id_suffix||slugify(v.name)||""}"
            placeholder="${slugify(v.name)||"nazwa_encji"}">
          <span class="hint">
            Prefiks: <code style="font-size:11px">${isCover?"cover":isScd?"switch":isGca?"sensor":isGcd?"binary_sensor":isSca?"number":"entity"}.${slugify(this._selected?.name||"")||"device"}_</code>
            &nbsp;Możesz zmienić przed zapisem.
          </span>
        </div>
        ` : `${v.entity_id_suffix || v.name ? `
        <div style="font-size:11px;color:var(--secondary-text-color);padding:4px 0 6px;display:flex;flex-direction:column;gap:3px">
          <div><span style="opacity:.7">Friendly name: </span>
            <strong style="color:var(--primary-text-color)">${this._selected?.name||""} ${v.name||""}</strong>
          </div>
          ${v.entity_id_suffix ? `<div><span style="opacity:.7">entity_id: </span>
            <code style="background:var(--secondary-background-color);padding:1px 5px;border-radius:3px">${isCover?"cover":isScd?v.entity_type||"switch":isGca?"sensor":isGcd?"binary_sensor":isSca?"number":"entity"}.${slugify(this._selected?.name||"")}_${v.entity_id_suffix}</code>
          </div>` : ""}
        </div>` : ""}`}

        ${isCover ? `
        <div class="field"><label>Typ rolety</label>
          <select id="f-cdc">
            ${COVER_DEVICE_CLASSES.map(c=>
              `<option value="${c.value}" ${(v.cover_device_class||"blind")===c.value?"selected":""}>${c.label}</option>`
            ).join("")}
          </select>
          <span class="hint">Wpływa na nazwę i ikonę w HA oraz rozpoznawanie przez Assist</span>
        </div>

        <div class="field"><label>Obwód góra <span style="color:#b71c1c">*</span></label>
          <div style="display:grid;grid-template-columns:1fr 110px;gap:8px;align-items:center">
            <input type="text" id="f-cup" value="${v.up||""}" placeholder="np. ro1sup">
            <select id="f-cup-v">
              <option value="0" ${v.val_up==0?"selected":""}>0 — wyłącz</option>
              <option value="1" ${v.val_up==1?"selected":""}>1 — włącz</option>
              <option value="2" ${v.val_up==2?"selected":""}>2 — toggle</option>
            </select>
          </div>
          <span class="hint">@scd — wartość wysyłana przy ▲</span>
        </div>
        <div class="field"><label>Obwód dół <span style="color:#b71c1c">*</span></label>
          <div style="display:grid;grid-template-columns:1fr 110px;gap:8px;align-items:center">
            <input type="text" id="f-cdn" value="${v.down||""}" placeholder="np. ro1sdn">
            <select id="f-cdn-v">
              <option value="0" ${v.val_down==0?"selected":""}>0 — wyłącz</option>
              <option value="1" ${v.val_down==1?"selected":""}>1 — włącz</option>
              <option value="2" ${v.val_down==2?"selected":""}>2 — toggle</option>
            </select>
          </div>
          <span class="hint">@scd — wartość wysyłana przy ▼</span>
        </div>
        <div class="field"><label>Obwód stop</label>
          <div style="display:grid;grid-template-columns:1fr 110px;gap:8px;align-items:center">
            <input type="text" id="f-cstp" value="${v.stop||""}" placeholder="np. ro1stp (opcjonalne)">
            <select id="f-cstp-v">
              <option value="0" ${v.val_stop==0?"selected":""}>0 — wyłącz</option>
              <option value="1" ${v.val_stop==1?"selected":""}>1 — włącz</option>
              <option value="2" ${v.val_stop==2?"selected":""}>2 — toggle</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Krańcówka góra</label>
          <input type="text" id="f-cup-s" value="${v.state_up||""}" placeholder="np. ro1ups (opcjonalne)">
          <span class="hint">@gcd — 1 gdy roleta w górnej pozycji</span>
        </div>
        <div class="field"><label>Krańcówka dół</label>
          <input type="text" id="f-cdn-s" value="${v.state_dn||""}" placeholder="np. ro1dns (opcjonalne)">
          <span class="hint">@gcd — 1 gdy roleta w dolnej pozycji</span>
        </div>
        ` : `

        <div class="field"><label>Typ obwodu</label>
          <select id="f-c">
            ${Object.entries(CIRCUITS).map(([k,c])=>`<option value="${k}" ${v.circuit===k?"selected":""}>${c.label}</option>`).join("")}
          </select>
        </div>

        <div class="field"><label>Obwód w Sterboxie</label>
          <input type="text" id="f-q" value="${v.query}" placeholder="np. temp_k, ro1sup">
        </div>

        ${isScd ? `<div class="field"><label>Typ encji</label>
          <select id="f-et">
            <option value="switch"    ${v.entity_type==="switch"?"selected":""}>Switch — stan lokalny (brak potwierdzenia)</option>
            <option value="switch_fb" ${v.entity_type==="switch_fb"?"selected":""}>Switch z feedbackiem — stan z @gcd</option>
            <option value="button"    ${v.entity_type==="button"?"selected":""}>Button — jednorazowy impuls</option>
          </select></div>` : ""}

        ${isScd && v.entity_type==="switch_fb" ? `
        <div class="field"><label>Obwód potwierdzenia</label>
          <input type="text" id="f-fbq" value="${v.feedback_query||""}" placeholder="np. ro1ups">
          <span class="hint">@gcd — coordinator odczytuje stan i aktualizuje switch</span>
        </div>
        <div class="field"><label>Timeout potwierdzenia (s) <span class="tip" data-tip="0 = nie sprawdzaj — stan zaktualizuje się
przy najbliższym odczycie @gcd.
>0 = zaloguj ostrzeżenie jeśli stan
nie zmienił się po N sekundach.">?</span></label>
          <input type="number" id="f-fbt" value="${v.feedback_timeout||5}" min="0" max="60">
          <span class="hint">0 = nie sprawdzaj (stan zaktualizuje się przy najbliższym odczycie @gcd)<br>>0 = zaloguj ostrzeżenie jeśli stan nie zmienił się po N sekundach</span>
        </div>` : ""}

        ${isScd && isBtn ? `<div class="field"><label>Wartość impulsu</label>
          <select id="f-bv">
            <option value="0" ${v.button_value==0?"selected":""}>0 — wyłącz</option>
            <option value="1" ${v.button_value==1?"selected":""}>1 — włącz</option>
            <option value="2" ${v.button_value==2?"selected":""}>2 — toggle</option>
          </select></div>` : ""}

        ${isGca ? `
        <div class="field"><label>Typ wartości</label>
          <select id="f-dc">
            ${Object.entries(SENSOR_DEVICE_CLASSES).map(([k,c])=>
              `<option value="${k}" ${(v.device_class||"")=== k?"selected":""}>${c.label}</option>`
            ).join("")}
          </select>
          <span class="hint">Określa ikonę, jednostkę i agregację historii w HA</span>
        </div>
        <div class="field"><label>Jednostka</label>
          <input type="text" id="f-u" value="${v.unit||""}" placeholder="°C, %, W, V">
        </div>
        <div class="field"><label>Precyzja wyświetlania <span class="tip" data-tip="Liczba miejsc po przecinku w HA.
0 = liczba całkowita (21)
1 = jedno miejsce (21.5)
2 = dwa miejsca (21.50)">?</span></label>
          <input type="number" id="f-prec" value="${v.precision??2}" min="0" max="6" step="1">
        </div>` : ""}

        ${isGcd ? `
        <div class="field"><label>Typ czujnika</label>
          <select id="f-dc">
            ${BINARY_DEVICE_CLASSES.map(c=>
              `<option value="${c.value}" ${(v.device_class||"")==c.value?"selected":""}>${c.label}</option>`
            ).join("")}
          </select>
          <span class="hint">Określa ikonę i etykiety ON/OFF w HA</span>
        </div>` : ""}

        ${isSca ? `
        <div class="field"><label>Tryb sterowania</label>
          <select id="f-nm">
            <option value="slider" ${(v.number_mode||"slider")==="slider"?"selected":""}>🎚 Suwak — zakres min/max</option>
            <option value="box"    ${v.number_mode==="box"?"selected":""}>✏️ Pole tekstowe — dowolna wartość</option>
          </select>
          <span class="hint">Suwak: ograniczony zakres. Pole: wpisujesz dowolną wartość, działa też z automatami</span>
        </div>
        ${(v.number_mode||"slider")==="slider" ? `
        <div class="field"><label>Zakres i krok</label>
          <div class="row3">
            <div><label>Min</label><input type="number" id="f-mn" value="${v.min??0}" step="any"></div>
            <div><label>Max</label><input type="number" id="f-mx" value="${v.max??100}" step="any"></div>
            <div><label>Krok</label><input type="number" id="f-st" value="${v.step??1}" step="any"></div>
          </div>
        </div>` : `
        <div class="field"><label>Krok (precyzja)</label>
          <input type="number" id="f-st" value="${v.step??0.01}" step="any" placeholder="np. 0.01">
          <span class="hint">Najmniejsza zmiana wartości, np. 0.01 dla dwóch miejsc po przecinku</span>
        </div>`}
        ` : ""}
        `}

        ${(isScd || isSca) ? `
        <div class="field"><label>Ikona (opcjonalne)</label>
          <input type="text" id="f-icon" value="${v.icon||""}" placeholder="np. mdi:lightbulb, mdi:pump, mdi:fan">
          <span class="hint">Ikona MDI — <a href="https://pictogrammers.com/library/mdi/" target="_blank" style="color:var(--primary-color)">przeglądaj ikony</a></span>
        </div>` : ""}

        <hr style="border:none;border-top:1px solid var(--divider-color);margin:4px 0">

        ${!isScd && !isSca ? `
        <div class="field"><label>Priorytet odpytywania</label>
          <select id="f-pri">
            ${Object.entries(PRIORITIES).map(([k,label])=>{
              const sec = k==="high"?this._selected?.interval_high||1:k==="medium"?this._selected?.interval_medium||5:this._selected?.interval_low||10;
              return `<option value="${k}" ${(v.priority||"high")===k?"selected":""}>${label} (${sec}s)</option>`;
            }).join("")}
          </select>
          <span class="hint">Jak często Sterbox będzie odpytywany o tę zmienną</span>
        </div>
        ` : ""}

        <div class="field"><label>Grupa (opcjonalne)</label>
          <select id="f-grp">
            <option value="" ${!v.group?"selected":""}>— Bez grupy —</option>
            ${(this._selected?.groups||[]).map(g=>
              `<option value="${g}" ${v.group===g?"selected":""}>${g}</option>`
            ).join("")}
          </select>
          <span class="hint">Grupy definiujesz w widoku Urządzenie</span>
        </div>

      </div>
      <div class="ff">
        <button class="btn btn-p" id="f-save">💾 Zapisz</button>
        <button class="btn" id="f-cancel">Anuluj</button>
      </div>
    </div>`;
  }


  async _saveGroups(groups, renameMap = {}) {
    // Zaktualizuj zmienne lokalnie
    let updatedVars = this._selected.vars || [];

    if (Object.keys(renameMap).length) {
      updatedVars = updatedVars.map(v => ({
        ...v,
        group: renameMap[v.group] !== undefined ? renameMap[v.group] : v.group,
      }));
    }

    const removed = (this._selected.groups||[]).filter(g =>
      !groups.includes(g) && !Object.keys(renameMap).includes(g)
    );
    if (removed.length) {
      updatedVars = updatedVars.map(v => ({
        ...v,
        group: removed.includes(v.group) ? "" : v.group,
      }));
    }

    try {
      // Krok 1 — zapisz grupy
      await this._hass.callWS({
        type:     "sterbox/update_groups",
        entry_id: this._selected.entry_id,
        groups,
      });
      this._selected.groups = groups;

      // Krok 2 — jeśli zmienily się przypisania zmiennych, zaktualizuj vars osobno
      const varsChanged = JSON.stringify(updatedVars) !== JSON.stringify(this._selected.vars||[]);
      if (varsChanged) {
        await this._hass.callWS({
          type:     "sterbox/update_vars",
          entry_id: this._selected.entry_id,
          vars:     updatedVars,
        });
        this._selected.vars = updatedVars;
        // Poczekaj na reload jeśli był potrzebny
        await new Promise(r => setTimeout(r, 500));
      }
    } catch(e) {
      this._error = "Błąd zapisu grup: " + e.message;
    }
    this._editGroupIdx = -1;
    this._render();
  }

  async _addGroup() {
    const input = this.shadowRoot.getElementById("grp-new");
    const name  = input?.value?.trim();
    if (!name) return;
    if ((this._selected?.groups||[]).includes(name)) {
      this._error = `Grupa "${name}" już istnieje`;
      this._render();
      return;
    }
    const groups = [...(this._selected?.groups||[]), name];
    await this._saveGroups(groups);
  }

  async _deleteGroup(idx) {
    const name   = this._selected.groups[idx];
    const inUse  = (this._selected.vars||[]).filter(v => v.group === name).length;
    const msg    = inUse
      ? `Usunąć grupę "${name}"?
${inUse} zmiennych trafi do "Bez grupy".`
      : `Usunąć grupę "${name}"?`;
    if (!confirm(msg)) return;
    const groups = [...(this._selected.groups||[])];
    groups.splice(idx, 1);
    await this._saveGroups(groups);
  }

  async _saveGroupRename(idx) {
    const input   = this.shadowRoot.getElementById(`grp-edit-${idx}`);
    const newName = input?.value?.trim();
    const oldName = this._selected.groups[idx];
    if (!newName) { this._editGroupIdx = -1; this._render(); return; }
    if (newName === oldName) { this._editGroupIdx = -1; this._render(); return; }
    if ((this._selected.groups||[]).includes(newName)) {
      this._error = `Grupa "${newName}" już istnieje`;
      this._render();
      return;
    }
    const groups    = [...(this._selected.groups||[])];
    groups[idx]     = newName;
    const renameMap = { [oldName]: newName };
    await this._saveGroups(groups, renameMap);
  }

  async _writeValue(circuit, query, value) {
    try {
      const res = await this._hass.callWS({
        type:     "sterbox/write_value",
        entry_id: this._selected.entry_id,
        circuit, query, value,
      });
      if (!res.ok) this._error = `Błąd zapisu @${circuit}?${query}=${value}`;
    } catch(e) {
      this._error = "Błąd zapisu: " + e.message;
    }
    this._render();
  }

  _exportVars() {
    const data = {
      sterbox_vars_export: true,
      name:  this._selected?.name || "",
      vars:  this._selected?.vars || [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `sterbox_${(this._selected?.name||"vars").replace(/\s+/g,"_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async _importVars(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.sterbox_vars_export || !Array.isArray(data.vars)) {
        this._error = "Nieprawidłowy format pliku — oczekiwano eksportu Sterbox";
        this._render();
        return;
      }
      const mode = confirm(
        `Importuj ${data.vars.length} zmiennych z "${data.name || "pliku"}"?\n\n` +
        `OK = Zastąp wszystkie obecne zmienne\n` +
        `Anuluj = Dołącz do istniejących (pomija duplikaty nazw)`
      );
      let newVars;
      if (mode) {
        newVars = data.vars;
      } else {
        const existing = new Set((this._selected?.vars||[]).map(v=>v.name));
        const toAdd    = data.vars.filter(v => !existing.has(v.name));
        newVars        = [...(this._selected?.vars||[]), ...toAdd];
      }
      await this._saveVars(newVars);
    } catch(e) {
      this._error = "Błąd importu: " + e.message;
      this._render();
    }
  }

  _bind() {
    const sr = this.shadowRoot;
    const $  = id => sr.getElementById(id);

    $("btn-reload")?.addEventListener("click", () => this._load());
    $("ec")?.addEventListener("click",  () => { this._error=""; this._render(); });
    $("btn-ref")?.addEventListener("click", () => this._load());

    sr.querySelectorAll("[data-view]").forEach(el =>
      el.addEventListener("click", () => { this._view=el.dataset.view; this._editVar=null; this._render(); })
    );
    sr.querySelectorAll("[data-entry]").forEach(el =>
      el.addEventListener("click", () => this._selectInstance(el.dataset.entry))
    );

    $("btn-add")?.addEventListener("click",    () => this._startAdd());
    $("btn-export")?.addEventListener("click",  () => this._exportVars());
    $("btn-test-conn")?.addEventListener("click", () => this._testConnection());
    sr.getElementById("btn-import")?.addEventListener("change", e => {
      if (e.target.files[0]) this._importVars(e.target.files[0]);
    });
    $("fi")?.addEventListener("input", e => {
      this._filter = e.target.value;
      // Filtruj bez przebudowy całego DOM — tylko aktualizuj tabelę
      const tbl = this.shadowRoot.querySelector(".content");
      if (tbl) {
        const vars = this._selected?.vars || [];
        const filtered = vars.filter(v => {
          const d = this._filterDir;
          return (d==="all" || (d==="read" && ["gca","gcd"].includes(v.circuit)) || (d==="write" && ["sca","scd"].includes(v.circuit)) || (d==="write" && v.entity_type==="cover"))
            && (!this._filter || v.name.toLowerCase().includes(this._filter.toLowerCase()) || (v.query||"").toLowerCase().includes(this._filter.toLowerCase()));
        });
        tbl.innerHTML = filtered.length ? this._tbl(filtered) : `<div class="empty">${this._filter?"Brak wyników":"Brak zmiennych — kliknij Dodaj"}</div>`;
        // Re-bind akcji w tabeli
        this.shadowRoot.querySelectorAll("[data-edit]").forEach(el =>
          el.addEventListener("click", () => this._startEdit(parseInt(el.dataset.edit)))
        );
        this.shadowRoot.querySelectorAll("[data-del]").forEach(el =>
          el.addEventListener("click", () => this._deleteVar(parseInt(el.dataset.del)))
        );
        this.shadowRoot.querySelectorAll("[data-write-cir]").forEach(el => {
          el.addEventListener("click", () => {
            const cir = el.dataset.writeCir;
            const q   = el.dataset.writeQ;
            const v   = parseFloat(el.dataset.writeV);
            if (cir && q && !isNaN(v)) this._writeValue(cir, q, v);
          });
        });
      } else {
        this._render();
      }
    });
    sr.querySelectorAll("[data-dir]").forEach(el =>
      el.addEventListener("click", () => { this._filterDir=el.dataset.dir; this._render(); })
    );
    sr.querySelectorAll("[data-edit]").forEach(el =>
      el.addEventListener("click", () => this._startEdit(parseInt(el.dataset.edit)))
    );
    sr.querySelectorAll("[data-del]").forEach(el =>
      el.addEventListener("click", () => this._deleteVar(parseInt(el.dataset.del)))
    );

    // Przyciski zapisu w tabeli
    sr.querySelectorAll("[data-write-cir]").forEach(el => {
      el.addEventListener("click", () => {
        const cir = el.dataset.writeCir;
        const q   = el.dataset.writeQ;
        const v   = parseFloat(el.dataset.writeV);
        if (cir && q && !isNaN(v)) this._writeValue(cir, q, v);
      });
    });

    // Number input — wyślij po Enter lub blur
    sr.querySelectorAll("[data-number-input]").forEach(el => {
      const send = () => {
        const cir = el.dataset.writeCir;
        const q   = el.dataset.writeQ;
        const v   = parseFloat(el.value);
        if (cir && q && !isNaN(v)) this._writeValue(cir, q, v);
      };
      el.addEventListener("keydown", e => { if (e.key === "Enter") send(); });
      el.addEventListener("blur", send);
    });

    $("btn-save-dev")?.addEventListener("click", () => this._saveDevice());
    $("grp-add")?.addEventListener("click", () => this._addGroup());
    $("grp-new")?.addEventListener("keydown", e => { if (e.key === "Enter") this._addGroup(); });

    sr.querySelectorAll("[data-grp-edit]").forEach(el =>
      el.addEventListener("click", () => { this._editGroupIdx = parseInt(el.dataset.grpEdit); this._render(); })
    );
    sr.querySelectorAll("[data-grp-save]").forEach(el =>
      el.addEventListener("click", () => this._saveGroupRename(parseInt(el.dataset.grpSave)))
    );
    sr.querySelectorAll("[data-grp-del]").forEach(el =>
      el.addEventListener("click", () => this._deleteGroup(parseInt(el.dataset.grpDel)))
    );
    $("grp-cancel-btn")?.addEventListener("click", () => { this._editGroupIdx = -1; this._render(); });
    // Enter w polu edycji grupy
    sr.querySelectorAll('[id^="grp-edit-"]').forEach(el => {
      const idx = parseInt(el.id.replace("grp-edit-", ""));
      el.addEventListener("keydown", e => { if (e.key === "Enter") this._saveGroupRename(idx); });
    });
    $("f-save")?.addEventListener("click",   () => this._saveEditVar());
    $("f-cancel")?.addEventListener("click", () => this._cancelEdit());

    // Przełącznik typ encji (zmienna/cover)
    $("f-etype")?.addEventListener("change", e => {
      if (e.target.value === COVER_TYPE) {
        this._editVar.entity_type = COVER_TYPE;
      } else {
        this._editVar.entity_type = CIRCUITS[this._editVar.circuit || "gca"].entity_type;
      }
      this._render();
    });

    $("f-c")?.addEventListener("change", e => {
      this._editVar.circuit     = e.target.value;
      this._editVar.entity_type = CIRCUITS[e.target.value].entity_type;
      this._render();
    });

    // Cover fields
    $("f-cdc")?.addEventListener("change",  e => this._editVar.cover_device_class = e.target.value);
    $("f-cup")?.addEventListener("input",   e => this._editVar.up       = e.target.value);
    $("f-cdn")?.addEventListener("input",   e => this._editVar.down     = e.target.value);
    $("f-cstp")?.addEventListener("input",  e => this._editVar.stop     = e.target.value);
    $("f-cup-s")?.addEventListener("input", e => this._editVar.state_up = e.target.value);
    $("f-cdn-s")?.addEventListener("input", e => this._editVar.state_dn = e.target.value);
    $("f-pri")?.addEventListener("change", e => this._editVar.priority = e.target.value);
    $("test-close")?.addEventListener("click", () => { this._testResult = null; this._render(); });
    $("f-grp")?.addEventListener("change", e => this._editVar.group    = e.target.value);
    $("f-cup-v")?.addEventListener("change",  e => this._editVar.val_up   = e.target.value);
    $("f-cdn-v")?.addEventListener("change",  e => this._editVar.val_down = e.target.value);
    $("f-cstp-v")?.addEventListener("change", e => this._editVar.val_stop = e.target.value);
    $("f-et")?.addEventListener("change", e => {
      this._editVar.entity_type = e.target.value;
      this._render();  // re-render żeby pokazać/ukryć pola feedback
    });
    [["f-n","name"],["f-q","query"],["f-u","unit"]].forEach(([id,k]) =>
      $(id)?.addEventListener("input", e => {
        this._editVar[k] = e.target.value;
        // Dla nazwy — auto-aktualizuj suffix entity_id bez re-renderu
        if (k === "name" && this._editIdx < 0) {
          const autoSuffix = slugify(e.target.value);
          const eidEl = this.shadowRoot.getElementById("f-eid");
          // Aktualizuj pole entity_id tylko jeśli user go nie zmienił ręcznie
          if (eidEl && (!this._editVar.entity_id_suffix || this._editVar.entity_id_suffix === this._lastAutoSuffix)) {
            this._editVar.entity_id_suffix = autoSuffix;
            this._lastAutoSuffix = autoSuffix;
            eidEl.value = autoSuffix;
            // Zaktualizuj też prefiks (bez re-renderu)
            const prefixEl = this.shadowRoot.getElementById("f-eid-prefix");
            if (prefixEl) prefixEl.textContent = prefixEl.textContent; // no-op, prefix nie zmienia się
          }
        }
      })
    );
    [["f-mn","min"],["f-mx","max"],["f-st","step"]].forEach(([id,k]) =>
      $(id)?.addEventListener("input", e => {
        this._editVar[k] = e.target.value;
        // Dla nazwy — auto-aktualizuj suffix entity_id bez re-renderu
        if (k === "name" && this._editIdx < 0) {
          const autoSuffix = slugify(e.target.value);
          const eidEl = this.shadowRoot.getElementById("f-eid");
          // Aktualizuj pole entity_id tylko jeśli user go nie zmienił ręcznie
          if (eidEl && (!this._editVar.entity_id_suffix || this._editVar.entity_id_suffix === this._lastAutoSuffix)) {
            this._editVar.entity_id_suffix = autoSuffix;
            this._lastAutoSuffix = autoSuffix;
            eidEl.value = autoSuffix;
            // Zaktualizuj też prefiks (bez re-renderu)
            const prefixEl = this.shadowRoot.getElementById("f-eid-prefix");
            if (prefixEl) prefixEl.textContent = prefixEl.textContent; // no-op, prefix nie zmienia się
          }
        }
      })
    );
    $("f-bv")?.addEventListener("change",  e => this._editVar.button_value      = e.target.value);
    $("f-eid")?.addEventListener("input",  e => this._editVar.entity_id_suffix  = e.target.value);
    $("f-icon")?.addEventListener("input", e => this._editVar.icon               = e.target.value);
    $("f-prec")?.addEventListener("input", e => this._editVar.precision          = e.target.value);
    $("f-nm")?.addEventListener("change",  e => { this._editVar.number_mode = e.target.value; this._render(); });
    $("f-fbq")?.addEventListener("input",  e => this._editVar.feedback_query   = e.target.value);
    $("f-fbt")?.addEventListener("input",  e => this._editVar.feedback_timeout = e.target.value);

    // device_class select — auto-wypelnij jednostke dla sensor
    $("f-dc")?.addEventListener("change", e => {
      const dc = e.target.value;
      this._editVar.device_class = dc;
      // Dla sensora analogowego — auto-wypelnij jednostke i state_class
      if (this._editVar.circuit === "gca") {
        const info = SENSOR_DEVICE_CLASSES[dc] || {};
        if (info.unit !== undefined) {
          this._editVar.unit        = info.unit;
          this._editVar.state_class = info.state_class || "measurement";
        }
      }
      this._render();
    });
  }
}

customElements.define("sterbox-panel", SterboxPanel);
