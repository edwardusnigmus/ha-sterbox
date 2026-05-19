"""WebSocket API dla panelu Sterbox."""
from __future__ import annotations
import logging
from typing import Any
import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from .const import (
    CONF_FAILURE_THRESHOLD, CONF_GROUPS, CONF_HOST, CONF_REAUTH_INTERVAL, CONF_INTERVAL_HIGH, CONF_INTERVAL_LOW, CONF_INTERVAL_MEDIUM,
    CONF_NAME, CONF_REST_DELAY, CONF_VARS, DEFAULT_INTERVAL_HIGH,
    DEFAULT_FAILURE_THRESHOLD, DEFAULT_INTERVAL_LOW, DEFAULT_INTERVAL_MEDIUM,
    DEFAULT_REAUTH_INTERVAL, DEFAULT_REST_DELAY, DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_get_instances)
    websocket_api.async_register_command(hass, ws_update_vars)
    websocket_api.async_register_command(hass, ws_update_device)
    websocket_api.async_register_command(hass, ws_test_connection)
    websocket_api.async_register_command(hass, ws_write_value)
    websocket_api.async_register_command(hass, ws_update_groups)


def _get_auth_stats(hass: HomeAssistant, entry_id: str) -> dict:
    """Zwraca statystyki autoryzacji coordinatora."""
    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if coordinator is None:
        return {}
    return coordinator.auth_stats


def _get_current_data(hass: HomeAssistant, entry_id: str) -> dict:
    """Zwraca aktualne wartości odczytane przez coordinator."""
    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if coordinator is None or coordinator.data is None:
        return {}
    return dict(coordinator.data)


def _get_online_status(hass: HomeAssistant, entry_id: str) -> bool:
    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if coordinator is None:
        return False
    if not coordinator.read_vars:
        return True
    return coordinator.last_update_success


def _get_config(entry) -> dict:
    return {**entry.data, **(entry.options or {})}


# ── Get instances ─────────────────────────────────────────────────────────────

@websocket_api.websocket_command({"type": "sterbox/get_instances"})
@websocket_api.async_response
async def ws_get_instances(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    entries = hass.config_entries.async_entries(DOMAIN)
    result = []
    for entry in entries:
        config = _get_config(entry)
        result.append({
            "entry_id":        entry.entry_id,
            "title":           entry.title,
            "state":           entry.state.value,
            "online":          _get_online_status(hass, entry.entry_id),
            "host":            config.get(CONF_HOST, ""),
            "name":            config.get(CONF_NAME, entry.title),
            "interval_high":   config.get(CONF_INTERVAL_HIGH,   DEFAULT_INTERVAL_HIGH),
            "interval_medium": config.get(CONF_INTERVAL_MEDIUM, DEFAULT_INTERVAL_MEDIUM),
            "interval_low":    config.get(CONF_INTERVAL_LOW,    DEFAULT_INTERVAL_LOW),
            "rest_delay":      config.get(CONF_REST_DELAY,      DEFAULT_REST_DELAY),
            "reauth_interval":    config.get(CONF_REAUTH_INTERVAL, DEFAULT_REAUTH_INTERVAL),
            "failure_threshold":  config.get(CONF_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD),
            "password":        config.get("password", ""),
            "vars":            config.get(CONF_VARS, []),
            "groups":          config.get(CONF_GROUPS, []),
            "current_data":    _get_current_data(hass, entry.entry_id),
            "auth_stats":      _get_auth_stats(hass, entry.entry_id),
        })
    connection.send_result(msg["id"], {"instances": result})


# ── Update vars ───────────────────────────────────────────────────────────────

@websocket_api.websocket_command({
    "type": "sterbox/update_vars",
    vol.Required("entry_id"): str,
    vol.Required("vars"): list,
})
@websocket_api.async_response
async def ws_update_vars(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    entry_id = msg["entry_id"]
    new_vars  = msg["vars"]
    entry = hass.config_entries.async_get_entry(entry_id)
    if not entry:
        connection.send_error(msg["id"], "not_found", f"Entry {entry_id} not found")
        return

    config   = _get_config(entry)
    old_vars = config.get(CONF_VARS, [])
    old_keys = {(v.get("name"), v.get("circuit")) for v in old_vars}
    new_keys = {(v.get("name"), v.get("circuit")) for v in new_vars}
    needs_reload = old_keys != new_keys

    hass.config_entries.async_update_entry(
        entry, options={**config, CONF_VARS: new_vars}
    )

    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if needs_reload:
        await hass.config_entries.async_reload(entry_id)
    else:
        if coordinator:
            coordinator.update_vars(new_vars)
            await coordinator.async_request_refresh()

    connection.send_result(msg["id"], {"success": True, "reloaded": needs_reload})


# ── Update device ─────────────────────────────────────────────────────────────

@websocket_api.websocket_command({
    "type": "sterbox/update_device",
    vol.Required("entry_id"):        str,
    vol.Required("name"):            str,
    vol.Required("host"):            str,
    vol.Required("password"):        str,
    vol.Required("interval_high"):   int,
    vol.Required("interval_medium"): int,
    vol.Required("interval_low"):    int,
    vol.Optional("rest_delay"):      float,
    vol.Optional("reauth_interval"):  int,
    vol.Optional("failure_threshold"): int,
})
@websocket_api.async_response
async def ws_update_device(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    entry_id = msg["entry_id"]
    entry = hass.config_entries.async_get_entry(entry_id)
    if not entry:
        connection.send_error(msg["id"], "not_found", f"Entry {entry_id} not found")
        return

    config = _get_config(entry)
    needs_reload = (
        config.get(CONF_HOST, "")     != msg["host"] or
        config.get(CONF_REAUTH_INTERVAL, DEFAULT_REAUTH_INTERVAL) != msg.get("reauth_interval", DEFAULT_REAUTH_INTERVAL) or
        config.get("password", "")    != msg["password"] or
        config.get(CONF_INTERVAL_HIGH,   DEFAULT_INTERVAL_HIGH)   != msg["interval_high"] or
        config.get(CONF_INTERVAL_MEDIUM, DEFAULT_INTERVAL_MEDIUM) != msg["interval_medium"] or
        config.get(CONF_INTERVAL_LOW,    DEFAULT_INTERVAL_LOW)    != msg["interval_low"]
    )

    hass.config_entries.async_update_entry(
        entry,
        title=msg["name"],
        options={
            **config,
            CONF_NAME:            msg["name"],
            CONF_HOST:            msg["host"],
            "password":           msg["password"],
            CONF_INTERVAL_HIGH:   msg["interval_high"],
            CONF_INTERVAL_MEDIUM: msg["interval_medium"],
            CONF_INTERVAL_LOW:    msg["interval_low"],
            CONF_REST_DELAY:      msg.get("rest_delay", DEFAULT_REST_DELAY),
            CONF_REAUTH_INTERVAL:  msg.get("reauth_interval",  DEFAULT_REAUTH_INTERVAL),
            CONF_FAILURE_THRESHOLD: msg.get("failure_threshold", DEFAULT_FAILURE_THRESHOLD),
        },
    )

    if needs_reload:
        await hass.config_entries.async_reload(entry_id)

    connection.send_result(msg["id"], {"success": True, "reloaded": needs_reload})


# ── Test connection ───────────────────────────────────────────────────────────

@websocket_api.websocket_command({
    "type": "sterbox/test_connection",
    vol.Required("entry_id"): str,
})
@websocket_api.async_response
async def ws_test_connection(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    entry_id = msg["entry_id"]
    coordinator = hass.data.get(DOMAIN, {}).get(entry_id)
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return

    result = await coordinator.async_test_connection()
    connection.send_result(msg["id"], result)


# ── Write value — wywoływany przez przyciski w tabeli panelu ─────────────────

@websocket_api.websocket_command({
    "type":                    "sterbox/write_value",
    vol.Required("entry_id"):  str,
    vol.Required("circuit"):   str,
    vol.Required("query"):     str,
    vol.Required("value"):     vol.Any(int, float),
})
@websocket_api.async_response
async def ws_write_value(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Jednorazowy zapis wartości — wywoływany z panelu."""
    coordinator = hass.data.get(DOMAIN, {}).get(msg["entry_id"])
    if not coordinator:
        connection.send_error(msg["id"], "not_found", "Coordinator not found")
        return
    ok = await coordinator.async_write_value(
        msg["circuit"], msg["query"], msg["value"]
    )
    connection.send_result(msg["id"], {"ok": ok})


# ── Update groups ─────────────────────────────────────────────────────────────

@websocket_api.websocket_command({
    "type":                   "sterbox/update_groups",
    vol.Required("entry_id"): str,
    vol.Required("groups"):   list,
})
@websocket_api.async_response
@websocket_api.websocket_command({
    "type":                   "sterbox/update_groups",
    vol.Required("entry_id"): str,
    vol.Required("groups"):   list,
})
@websocket_api.async_response
async def ws_update_groups(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Zapisuje listę grup dla instancji. Nie przeładowuje integracji."""
    entry_id  = msg["entry_id"]
    new_groups = [g for g in msg["groups"] if g.strip()]

    entry = hass.config_entries.async_get_entry(entry_id)
    if not entry:
        connection.send_error(msg["id"], "not_found", f"Entry {entry_id} not found")
        return

    config = _get_config(entry)

    # JS przekazuje zaktualizowane zmienne jeśli zmieniła się nazwa grupy lub usunięto
    updated_vars = msg.get("vars", config.get(CONF_VARS, []))

    hass.config_entries.async_update_entry(
        entry,
        options={**config, CONF_GROUPS: new_groups, CONF_VARS: updated_vars},
    )
    connection.send_result(msg["id"], {"success": True})
