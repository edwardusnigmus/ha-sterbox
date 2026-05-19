"""Sterbox integration."""
from __future__ import annotations
import logging
import os

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
import homeassistant.helpers.config_validation as cv
import voluptuous as vol
from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig

import json as _json
from .const import CONF_HOST, CONF_NAME, CONF_VARS, DOMAIN, PLATFORMS

def _get_version() -> str:
    """Pobierz wersję z manifest.json — używana jako cache-buster dla JS."""
    try:
        manifest = os.path.join(os.path.dirname(__file__), "manifest.json")
        with open(manifest) as f:
            return _json.load(f).get("version", "0")
    except Exception:
        return "0"
from .coordinator import SterboxCoordinator

_LOGGER = logging.getLogger(__name__)

PANEL_URL    = f"/{DOMAIN}_panel"
PANEL_FILE   = "sterbox-panel.js"
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")


def _get_config(entry: ConfigEntry) -> dict:
    return {**entry.data, **(entry.options or {})}


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """
    Rejestracja panelu i serwisu zgodnie z dokumentacją HA:
    - serwisy rejestrujemy w async_setup, nie async_setup_entry
    - panel rejestrujemy w async_setup, zależności (panel_custom, frontend)
      są już załadowane bo są w manifest.json dependencies
    """
    hass.data.setdefault(DOMAIN, {})

    # Serwuj pliki frontend/
    await hass.http.async_register_static_paths([
        StaticPathConfig(PANEL_URL, FRONTEND_DIR, cache_headers=False)
    ])

    # Rejestruj panel boczny
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="sterbox-panel",
        frontend_url_path=DOMAIN,
        sidebar_title="Sterbox",
        sidebar_icon="mdi:chip",
        module_url=f"{PANEL_URL}/{PANEL_FILE}?v={_get_version()}",
        embed_iframe=False,
        require_admin=False,
    )

    # Rejestruj WebSocket API
    from .websocket import async_setup as ws_setup
    ws_setup(hass)

    _LOGGER.info("Sterbox: panel + websocket registered")
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Setup pojedynczej instancji Sterboxa."""
    hass.data.setdefault(DOMAIN, {})
    config = _get_config(entry)

    coordinator = SterboxCoordinator(hass, entry.entry_id, config)
    await coordinator.async_config_entry_first_refresh()
    coordinator.start_reauth_task()
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    _LOGGER.info(
        "Sterbox [%s / %s] ready, %d vars",
        config.get(CONF_NAME), config.get(CONF_HOST),
        len(config.get(CONF_VARS, [])),
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        coordinator: SterboxCoordinator = hass.data[DOMAIN].pop(entry.entry_id, None)
        if coordinator:
            await coordinator.async_shutdown()
    return unload_ok


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)
