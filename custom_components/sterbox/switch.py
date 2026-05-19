"""Switch — trzy warianty:
   - switch zwykły (@scd, stan lokalny)
   - switch z encją (@scd + osobny @gcd w coordinator, stan z odczytu)
   - switch z feedbackiem (@scd + @gcd, jedna encja, stan potwierdzony)
"""
from __future__ import annotations
import asyncio
import logging
from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    CIRCUIT_GCD, CIRCUIT_SCD,
    CONF_HOST, CONF_NAME, CONF_VARS, DOMAIN,
    ENTITY_SWITCH, ENTITY_SWITCH_FB,
    VAR_CIRCUIT, VAR_ENTITY_TYPE, VAR_ICON, VAR_FEEDBACK_QUERY,
    VAR_FEEDBACK_TIMEOUT, VAR_NAME, VAR_QUERY,
)
from .coordinator import SterboxCoordinator
from .entity_base import SterboxEntity

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    config      = {**entry.data, **(entry.options or {})}
    coordinator = hass.data[DOMAIN][entry.entry_id]
    name        = config.get(CONF_NAME, entry.title)
    host        = config.get(CONF_HOST, "")
    entities    = []

    for var in config.get(CONF_VARS, []):
        etype = var.get(VAR_ENTITY_TYPE)
        if etype == ENTITY_SWITCH:
            entities.append(SterboxSwitch(coordinator, var, name, host, entry.entry_id))
        elif etype == ENTITY_SWITCH_FB:
            entities.append(SterboxSwitchFeedback(coordinator, var, name, host, entry.entry_id))

    if entities:
        async_add_entities(entities)


# ─────────────────────────────────────────────────────────────────────────────
# Switch zwykły — stan lokalny, brak potwierdzenia
# ─────────────────────────────────────────────────────────────────────────────

class SterboxSwitch(SterboxEntity, SwitchEntity):
    """
    Switch zwykły.
    Stan trzymany lokalnie — nie czyta @gcd.
    Jeśli inny sterownik zmieni stan fizyczny — HA tego nie wie.
    """

    def __init__(self, coordinator, var, instance_name, host, entry_id):
        super().__init__(coordinator, var, instance_name, host, entry_id)
        icon = var.get(VAR_ICON, "")
        if icon:
            self._attr_icon = icon
        self._query  = var[VAR_QUERY]
        self._is_on  = False

    @property
    def is_on(self) -> bool:
        return self._is_on

    async def async_turn_on(self, **kwargs: Any) -> None:
        if await self.coordinator.async_write_value(CIRCUIT_SCD, self._query, 1):
            self._is_on = True
            self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        if await self.coordinator.async_write_value(CIRCUIT_SCD, self._query, 0):
            self._is_on = False
            self.async_write_ha_state()


# ─────────────────────────────────────────────────────────────────────────────
# Switch z feedbackiem — stan z @gcd, jedna encja
# ─────────────────────────────────────────────────────────────────────────────

class SterboxSwitchFeedback(SterboxEntity, SwitchEntity):
    """
    Switch z potwierdzeniem stanu.

    Wysyła @scd przy sterowaniu, ale stan czyta z @gcd (coordinator).
    Coordinator odpytuje @gcd co interval sekund — stan zawsze aktualny,
    niezależnie od źródła zmiany (HA, włącznik fizyczny, inny system).

    Jeśli po feedback_timeout sekundach @gcd nie potwierdzi zmiany
    — loguje ostrzeżenie (nie cofa stanu — PLC może mieć własną logikę).
    """

    def __init__(self, coordinator, var, instance_name, host, entry_id):
        super().__init__(coordinator, var, instance_name, host, entry_id)
        icon = var.get(VAR_ICON, "")
        if icon:
            self._attr_icon = icon
        self._query           = var[VAR_QUERY]
        self._feedback_query  = var.get(VAR_FEEDBACK_QUERY, "")
        self._feedback_timeout = float(var.get(VAR_FEEDBACK_TIMEOUT, 5))
        self._pending_state: bool | None = None  # oczekiwany stan po komendzie

    @property
    def is_on(self) -> bool | None:
        """
        Stan z coordinator.data (@gcd) — zawsze aktualny.
        Jeśli brak danych z @gcd — użyj stanu oczekiwanego (optymistyczny).
        """
        if self._feedback_query and self.coordinator.data:
            val = self.coordinator.data.get(self._feedback_query)
            if val is not None:
                self._pending_state = None  # potwierdzono — wyczyść oczekiwany
                return bool(int(val))
        # Brak danych z @gcd — pokaż stan oczekiwany lub None
        return self._pending_state

    @property
    def available(self) -> bool:
        return self.coordinator.last_update_success

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._send_command(1, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._send_command(0, False)

    async def _send_command(self, value: int, expected: bool) -> None:
        """Wyślij komendę i sprawdź potwierdzenie po timeout."""
        if not await self.coordinator.async_write_value(CIRCUIT_SCD, self._query, value):
            return

        # Ustaw stan oczekiwany — widoczny zanim coordinator odświeży @gcd
        self._pending_state = expected
        self.async_write_ha_state()

        # Jeśli mamy feedback — sprawdź po timeout
        if self._feedback_query and self._feedback_timeout > 0:
            await asyncio.sleep(self._feedback_timeout)
            actual = self.coordinator.data.get(self._feedback_query) if self.coordinator.data else None
            if actual is not None and bool(int(actual)) != expected:
                _LOGGER.warning(
                    "[%s] Switch %s: expected %s but @gcd?%s = %s after %.1fs",
                    self.coordinator.host, self._var_name,
                    expected, self._feedback_query, actual, self._feedback_timeout
                )
