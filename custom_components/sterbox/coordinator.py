"""Coordinator Sterbox — async odpytywanie z priorytetami."""
from __future__ import annotations
import asyncio
import logging
import time
from datetime import datetime
from typing import Any
import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from .const import (
    CIRCUIT_GCD, CONF_FAILURE_THRESHOLD, CONF_HOST, CONF_INTERVAL_HIGH, CONF_INTERVAL_LOW,
    CONF_INTERVAL_MEDIUM, CONF_PASSWORD, CONF_REAUTH_INTERVAL, CONF_REST_DELAY, CONF_VARS,
    DEFAULT_AUTH_RETRY_DELAY, DEFAULT_CONNECTION_RETRY_DELAY,
    DEFAULT_FAILURE_THRESHOLD, DEFAULT_INTERVAL_HIGH, DEFAULT_INTERVAL_LOW, DEFAULT_INTERVAL_MEDIUM,
    DEFAULT_MAX_CONNECTION_RETRIES, DEFAULT_REAUTH_INTERVAL, DEFAULT_REST_DELAY, DEFAULT_TIMEOUT,
    DOMAIN, ENTITY_COVER, ENTITY_SWITCH_FB, MAX_VARS_PER_REQUEST,
    PRIORITY_DEFAULT, PRIORITY_HIGH, PRIORITY_LOW, PRIORITY_MEDIUM,
    VAR_CIRCUIT, VAR_COVER_STATE_DN, VAR_COVER_STATE_UP,
    VAR_ENTITY_TYPE, VAR_FEEDBACK_QUERY, VAR_NAME, VAR_PRIORITY,
    VAR_QUERY, VAR_COVER_UP, VAR_COVER_DOWN, READ_CIRCUITS,
)

_LOGGER = logging.getLogger(__name__)


def _extract_read_vars(all_vars: list[dict]) -> dict[str, list[dict]]:
    """
    Wyciąga zmienne odczytu pogrupowane po priorytecie.
    Zwraca: {"high": [...], "medium": [...], "low": [...]}
    Deduplikacja po (circuit, query) — ta sama zmienna nie odpytywana 2x.
    """
    buckets: dict[str, list[dict]] = {
        PRIORITY_HIGH:   [],
        PRIORITY_MEDIUM: [],
        PRIORITY_LOW:    [],
    }
    seen: set[tuple] = set()

    def _add(circuit: str, query: str, name: str, priority: str) -> None:
        key = (circuit, query)
        if key in seen:
            return
        seen.add(key)
        # Trafia do najszybszego bucketu jeśli już jest w wolniejszym
        buckets[priority].append({
            VAR_NAME: name,
            VAR_CIRCUIT: circuit,
            VAR_QUERY: query,
        })

    for var in all_vars:
        etype    = var.get(VAR_ENTITY_TYPE, "")
        priority = var.get(VAR_PRIORITY, PRIORITY_DEFAULT)
        if priority not in buckets:
            priority = PRIORITY_HIGH

        if etype == ENTITY_COVER:
            if var.get(VAR_COVER_STATE_UP):
                _add(CIRCUIT_GCD, var[VAR_COVER_STATE_UP],
                     f"{var[VAR_NAME]}_state_up", priority)
            if var.get(VAR_COVER_STATE_DN):
                _add(CIRCUIT_GCD, var[VAR_COVER_STATE_DN],
                     f"{var[VAR_NAME]}_state_dn", priority)
        elif etype == ENTITY_SWITCH_FB:
            fb = var.get(VAR_FEEDBACK_QUERY, "")
            if fb:
                _add(CIRCUIT_GCD, fb, var[VAR_NAME], priority)
        elif var.get(VAR_CIRCUIT) in READ_CIRCUITS:
            _add(var[VAR_CIRCUIT], var[VAR_QUERY], var[VAR_NAME], priority)

    return buckets


class SterboxCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """
    Coordinator z trzema priorytetami odpytywania.
    high   → co interval_high sekund   (domyślnie 1s)
    medium → co interval_medium sekund (domyślnie 5s)
    low    → co interval_low sekund    (domyślnie 10s)
    """

    def __init__(self, hass: HomeAssistant, entry_id: str, config: dict) -> None:
        self.host     = config[CONF_HOST]
        self.password = config[CONF_PASSWORD]
        self._timeout = aiohttp.ClientTimeout(total=DEFAULT_TIMEOUT)
        self._session: aiohttp.ClientSession | None = None
        self._authenticated = False
        self._auth_lock = asyncio.Lock()
        self._error_counters: dict[str, int] = {}
        self._rest_delay       = config.get(CONF_REST_DELAY, DEFAULT_REST_DELAY)
        self._reauth_interval  = int(config.get(CONF_REAUTH_INTERVAL, DEFAULT_REAUTH_INTERVAL))
        self._reauth_task: asyncio.Task | None = None
        self._failure_threshold   = int(config.get(CONF_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD))
        self._consecutive_failures = 0
        # Statystyki autoryzacji
        self._last_auth_time:   datetime | None = None
        self._last_auth_reason: str = "startup"
        self._auth_count:       int = 0

        # Interwały dla priorytetów
        self._intervals = {
            PRIORITY_HIGH:   config.get(CONF_INTERVAL_HIGH,   DEFAULT_INTERVAL_HIGH),
            PRIORITY_MEDIUM: config.get(CONF_INTERVAL_MEDIUM, DEFAULT_INTERVAL_MEDIUM),
            PRIORITY_LOW:    config.get(CONF_INTERVAL_LOW,    DEFAULT_INTERVAL_LOW),
        }

        # Buckets zmiennych odczytu
        self._buckets = _extract_read_vars(config.get(CONF_VARS, []))

        # Czas następnego odpytania dla każdego bucketu
        now = time.monotonic()
        self._next_poll = {
            PRIORITY_HIGH:   now,
            PRIORITY_MEDIUM: now,
            PRIORITY_LOW:    now,
        }

        # DataUpdateCoordinator z interwałem = najkrótszy z priorytetów
        # Używamy go tylko do zarządzania stanem (last_update_success, listeners)
        # Faktyczne odpytywanie robimy sami w _async_update_data
        from datetime import timedelta
        super().__init__(
            hass, _LOGGER,
            name=f"{DOMAIN}_{entry_id}",
            update_interval=timedelta(seconds=self._intervals[PRIORITY_HIGH]),
        )

    def update_vars(self, new_vars: list[dict], new_intervals: dict | None = None) -> None:
        """Aktualizuje zmienne i opcjonalnie interwały bez restartu."""
        self._buckets = _extract_read_vars(new_vars)
        if new_intervals:
            self._intervals.update(new_intervals)
        total = sum(len(b) for b in self._buckets.values())
        _LOGGER.info("[%s] vars updated: %d read queries across buckets", self.host, total)

    @property
    def read_vars(self) -> list[dict]:
        """Wszystkie zmienne odczytu — dla kompatybilności."""
        result = []
        for bucket in self._buckets.values():
            result.extend(bucket)
        return result

    # ── URL ──────────────────────────────────────────────────────────────────

    @property
    def base_url(self) -> str:
        return f"http://{self.host}/"

    @property
    def auth_url(self) -> str:
        return f"{self.base_url}u7.cgi?q0={self.password}"

    # ── Sesja ────────────────────────────────────────────────────────────────

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self._timeout)
            self._authenticated = False
        return self._session

    async def async_shutdown(self) -> None:
        if self._reauth_task and not self._reauth_task.done():
            self._reauth_task.cancel()
        if self._session and not self._session.closed:
            await self._session.close()

    def start_reauth_task(self) -> None:
        """Uruchom proaktywny re-auth jeśli włączony."""
        if self._reauth_interval > 0:
            self._reauth_task = self.hass.async_create_task(
                self._proactive_reauth()
            )
            _LOGGER.info(
                "[%s] Proactive re-auth every %d min",
                self.host, self._reauth_interval
            )

    async def _proactive_reauth(self) -> None:
        """
        Co reauth_interval minut odświeża sesję zanim Sterbox ją zerwie.
        Pomija autoryzację jeśli hasło nie jest ustawione.
        """
        while True:
            await asyncio.sleep(self._reauth_interval * 60)
            if not self.password:
                continue  # brak hasła = brak potrzeby re-auth
            _LOGGER.debug("[%s] Proactive re-auth", self.host)
            self._authenticated    = False
            self._last_auth_reason = "proactive"
            await self._ensure_authenticated()

    # ── Autentykacja ─────────────────────────────────────────────────────────

    async def _authenticate(self) -> bool:
        try:
            session = await self._get_session()
            async with session.get(self.auth_url) as resp:
                if resp.status == 200:
                    _LOGGER.debug("[%s] Auth OK", self.host)
                    self._authenticated  = True
                    self._last_auth_time   = datetime.now()
                    self._auth_count      += 1
                    return True
                _LOGGER.warning("[%s] Auth HTTP %s", self.host, resp.status)
                return False
        except aiohttp.ClientError as e:
            _LOGGER.warning("[%s] Auth error: %s", self.host, e)
            return False

    async def _ensure_authenticated(self) -> bool:
        # Brak hasła = brak autoryzacji wymaganej
        if not self.password:
            self._authenticated = True
            return True
        if self._authenticated:
            return True
        async with self._auth_lock:
            if self._authenticated:
                return True
            for attempt in range(1, DEFAULT_MAX_CONNECTION_RETRIES + 1):
                _LOGGER.info("[%s] Auth attempt %d/%d", self.host, attempt,
                             DEFAULT_MAX_CONNECTION_RETRIES)
                if await self._authenticate():
                    return True
                if attempt < DEFAULT_MAX_CONNECTION_RETRIES:
                    await asyncio.sleep(DEFAULT_AUTH_RETRY_DELAY)
            _LOGGER.error("[%s] Auth failed after %d attempts",
                          self.host, DEFAULT_MAX_CONNECTION_RETRIES)
            return False

    async def _handle_auth_error(self, reason: str = "error_response") -> bool:
        self._authenticated    = False
        self._last_auth_reason = reason
        return await self._ensure_authenticated()

    # ── Zapytania ────────────────────────────────────────────────────────────

    def _build_read_query(self, variables: list[dict]) -> str:
        return "".join(f"@{v[VAR_CIRCUIT]}?{v[VAR_QUERY]}&" for v in variables)

    def _parse_value(self, raw: str, circuit: str, varname: str) -> float | int | None:
        value = raw.strip()
        if value == "er":
            cnt = self._error_counters.get(varname, 0) + 1
            self._error_counters[varname] = cnt
            _LOGGER.debug("[%s] 'er' for %s (x%d)", self.host, varname, cnt)
            return None
        self._error_counters[varname] = 0
        try:
            value = value.replace(",", ".")
            return int(float(value)) if circuit == CIRCUIT_GCD else float(value)
        except ValueError:
            _LOGGER.warning("[%s] Cannot parse '%s' for %s", self.host, value, varname)
            return None

    def _parse_response(self, text: str, variables: list[dict]) -> dict[str, Any]:
        values = text.strip("`").split("`")
        if len(values) != len(variables):
            _LOGGER.warning("[%s] Expected %d values, got %d",
                            self.host, len(variables), len(values))
            return {}
        result = {}
        for var, raw in zip(variables, values):
            parsed = self._parse_value(raw, var[VAR_CIRCUIT], var[VAR_NAME])
            if parsed is not None:
                result[var[VAR_NAME]] = parsed
        return result

    async def _fetch_batch(self, batch: list[dict], retry: bool = True) -> dict[str, Any]:
        if not await self._ensure_authenticated():
            return {}
        url = self.base_url + self._build_read_query(batch)
        try:
            session = await self._get_session()
            async with session.get(url) as resp:
                if resp.status != 200:
                    _LOGGER.warning("[%s] Read HTTP %s", self.host, resp.status)
                    if retry and await self._handle_auth_error():
                        return await self._fetch_batch(batch, retry=False)
                    return {}
                text   = await resp.text()
                result = self._parse_response(text, batch)
                if not result and retry:
                    if await self._handle_auth_error():
                        return await self._fetch_batch(batch, retry=False)
                return result
        except aiohttp.ClientError as e:
            _LOGGER.warning("[%s] Read error: %s", self.host, e)
            self._authenticated = False
            if self._session and not self._session.closed:
                await self._session.close()
            self._session = None
            self._last_auth_reason = "connection_error"
            if retry:
                await asyncio.sleep(DEFAULT_CONNECTION_RETRY_DELAY)
                if await self._ensure_authenticated():
                    return await self._fetch_batch(batch, retry=False)
            return {}

    async def _fetch_bucket(self, priority: str) -> dict[str, Any]:
        """Odpytuje wszystkie zmienne z danego bucketu (z podziałem na paczki po 35)."""
        vars_list = self._buckets.get(priority, [])
        if not vars_list:
            return {}
        combined: dict[str, Any] = {}
        batches = [
            vars_list[i:i + MAX_VARS_PER_REQUEST]
            for i in range(0, len(vars_list), MAX_VARS_PER_REQUEST)
        ]
        for i, batch in enumerate(batches):
            combined.update(await self._fetch_batch(batch))
            if i < len(batches) - 1 and self._rest_delay > 0:
                await asyncio.sleep(self._rest_delay)
        return combined

    # ── Główna metoda update ──────────────────────────────────────────────────

    async def _async_update_data(self) -> dict[str, Any]:
        """
        Wywoływana przez DataUpdateCoordinator co interval_high sekund.
        Sprawdza które buckety trzeba teraz odpytać na podstawie czasu.
        Zachowuje poprzednie dane — aktualizuje tylko to co odpytano.
        """
        now = time.monotonic()
        combined: dict[str, Any] = dict(self.data or {})
        any_fetched = False

        for priority in [PRIORITY_HIGH, PRIORITY_MEDIUM, PRIORITY_LOW]:
            if now >= self._next_poll[priority]:
                result = await self._fetch_bucket(priority)
                if result:
                    combined.update(result)
                    any_fetched = True
                self._next_poll[priority] = now + self._intervals[priority]

        if not any_fetched and not combined:
            total_vars = sum(len(b) for b in self._buckets.values())
            if total_vars > 0:
                self._consecutive_failures += 1
                _LOGGER.debug("[%s] No data — failure %d/%d", self.host,
                    self._consecutive_failures, self._failure_threshold)
                if self._consecutive_failures >= self._failure_threshold:
                    raise UpdateFailed(
                        f"[{self.host}] No data after {self._consecutive_failures} failures"
                    )
                return dict(self.data or {})
        else:
            self._consecutive_failures = 0

        return combined

    # ── Zapis jednorazowy ─────────────────────────────────────────────────────

    @property
    def auth_stats(self) -> dict:
        """Statystyki autoryzacji dla panelu."""
        reason_labels = {
            "startup":          "Start integracji",
            "proactive":        "Proaktywny (zaplanowany)",
            "error_response":   "Błąd odpowiedzi Sterboxa",
            "connection_error": "Błąd połączenia",
        }
        if not self.password:
            return {
                "last_auth_time":   None,
                "last_auth_reason": "Brak hasła — autoryzacja wyłączona",
                "auth_count":       0,
            }
        return {
            "last_auth_time":   self._last_auth_time.strftime("%H:%M:%S %d.%m") if self._last_auth_time else None,
            "last_auth_reason": reason_labels.get(self._last_auth_reason, self._last_auth_reason),
            "auth_count":       self._auth_count,
        }

    async def async_write_value(
        self, circuit: str, query: str, value: Any, retry: bool = True
    ) -> bool:
        if not await self._ensure_authenticated():
            return False
        formatted = str(value).replace(".", ",") if circuit == "sca" else str(int(value))
        url = f"{self.base_url}@{circuit}?{query}={formatted}&"
        try:
            session = await self._get_session()
            async with session.get(url) as resp:
                if resp.status != 200:
                    return False
                text = (await resp.text()).strip()
                if text == "ok":
                    return True
                if "er" in text and retry:
                    if await self._handle_auth_error():
                        return await self.async_write_value(
                            circuit, query, value, retry=False
                        )
                return False
        except aiohttp.ClientError as e:
            _LOGGER.warning("[%s] Write error: %s", self.host, e)
            self._authenticated = False
            return False

    # ── Test połączenia ───────────────────────────────────────────────────────

    async def async_test_connection(self) -> dict[str, Any]:
        """
        Testuje połączenie ze Sterboxem.
        Zwraca: {ok, auth_ok, read_ok, response_ms, error}
        """
        result: dict[str, Any] = {
            "ok": False, "auth_ok": False,
            "read_ok": False, "response_ms": None, "error": None,
        }
        # Test połączenia
        t0 = time.monotonic()
        try:
            session = await self._get_session()
            async with session.get(self.base_url) as resp:
                result["response_ms"] = round((time.monotonic() - t0) * 1000)
                if resp.status != 200:
                    result["error"] = f"HTTP {resp.status}"
                    return result
        except aiohttp.ClientError as e:
            result["error"] = str(e)
            return result

        # Test autoryzacji
        self._authenticated = False
        result["auth_ok"] = await self._authenticate()
        if not result["auth_ok"]:
            result["error"] = "Autoryzacja nieudana"
            return result

        # Test odczytu — pierwsze zmienne z high bucket
        sample = (self._buckets.get(PRIORITY_HIGH) or self.read_vars)[:1]
        if sample:
            t1 = time.monotonic()
            read_result = await self._fetch_batch(sample, retry=False)
            result["read_ms"]  = round((time.monotonic() - t1) * 1000)
            result["read_ok"]  = bool(read_result)
            result["read_val"] = str(read_result) if read_result else "brak danych"
        else:
            result["read_ok"]  = True
            result["read_val"] = "brak zmiennych odczytu"

        result["ok"] = result["auth_ok"] and result["read_ok"]
        return result
