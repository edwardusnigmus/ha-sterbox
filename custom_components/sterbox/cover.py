"""Cover — roleta sterowana przez Sterbox."""
from __future__ import annotations
import logging
from typing import Any

from homeassistant.components.cover import (
    CoverEntity,
    CoverEntityFeature,
    CoverDeviceClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    CIRCUIT_GCD, CIRCUIT_SCD,
    CONF_HOST, CONF_NAME, CONF_VARS, DOMAIN,
    ENTITY_COVER,
    VAR_COVER_DEVICE_CLASS, VAR_COVER_DOWN, VAR_COVER_FB_DN, VAR_COVER_FB_UP,
    VAR_COVER_STATE_DN, VAR_COVER_STATE_UP,
    VAR_COVER_STOP, VAR_COVER_UP, VAR_COVER_VAL_DOWN,
    VAR_COVER_VAL_STOP, VAR_COVER_VAL_UP,
    VAR_ENTITY_TYPE, VAR_NAME,
)
from .coordinator import SterboxCoordinator
from .entity_base import build_device_info, build_unique_id

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    config      = {**entry.data, **(entry.options or {})}
    coordinator = hass.data[DOMAIN][entry.entry_id]
    name        = config.get(CONF_NAME, entry.title)
    host        = config.get(CONF_HOST, "")
    entities = [
        SterboxCover(coordinator, var, name, host, entry.entry_id)
        for var in config.get(CONF_VARS, [])
        if var.get(VAR_ENTITY_TYPE) == ENTITY_COVER
    ]
    if entities:
        async_add_entities(entities)


class SterboxCover(CoordinatorEntity[SterboxCoordinator], CoverEntity):
    _attr_has_entity_name = True
    _attr_assumed_state   = True  # Zawsze aktywne przyciski — stan może być opóźniony

    def __init__(
        self,
        coordinator: SterboxCoordinator,
        var_config: dict,
        instance_name: str,
        host: str,
        entry_id: str,
    ) -> None:
        super().__init__(coordinator)

        self._name     = var_config[VAR_NAME]
        self._up       = var_config.get(VAR_COVER_UP, "")
        self._down     = var_config.get(VAR_COVER_DOWN, "")
        self._stop_q   = var_config.get(VAR_COVER_STOP, "")
        self._state_up = var_config.get(VAR_COVER_STATE_UP, "")
        self._state_dn = var_config.get(VAR_COVER_STATE_DN, "")

        # Wartości impulsów — domyślnie 1, można ustawić 0/1/2
        self._val_up   = int(var_config.get(VAR_COVER_VAL_UP,   1))
        self._val_down = int(var_config.get(VAR_COVER_VAL_DOWN, 1))
        self._val_stop = int(var_config.get(VAR_COVER_VAL_STOP, 1))

        self._moving: str | None = None
        self._fb_up = var_config.get(VAR_COVER_FB_UP, "")
        self._fb_dn = var_config.get(VAR_COVER_FB_DN, "")

        # device_class z konfiguracji — domyślnie blind (roleta)
        dc_map = {
            "blind":   CoverDeviceClass.BLIND,
            "shutter": CoverDeviceClass.SHUTTER,
            "curtain": CoverDeviceClass.CURTAIN,
            "awning":  CoverDeviceClass.AWNING,
            "shade":   CoverDeviceClass.SHADE,
            "garage":  CoverDeviceClass.GARAGE,
            "gate":    CoverDeviceClass.GATE,
        }
        dc_str = var_config.get(VAR_COVER_DEVICE_CLASS, "blind")
        self._attr_device_class = dc_map.get(dc_str, CoverDeviceClass.BLIND)

        self._attr_unique_id   = build_unique_id(entry_id, CIRCUIT_SCD, self._up)
        self._attr_name        = self._name
        self._attr_device_info = build_device_info(entry_id, instance_name, host)

        features = CoverEntityFeature.OPEN | CoverEntityFeature.CLOSE
        if self._stop_q:
            features |= CoverEntityFeature.STOP
        self._attr_supported_features = features

    # ── Stan z krańcówek ──────────────────────────────────────────────────────

    def _read_state(self, key_suffix: str) -> bool | None:
        if not self.coordinator.data:
            return None
        val = self.coordinator.data.get(f"{self._name}_{key_suffix}")
        return None if val is None else bool(int(val))

    @property
    def is_closed(self) -> bool | None:
        val = self._read_state("state_dn")
        if val:
            self._moving = None
        return val

    @property
    def is_open(self) -> bool | None:
        val = self._read_state("state_up")
        if val:
            self._moving = None
        return val

    @property
    def is_opening(self) -> bool:
        if self.is_open:
            return False
        # Feedback z PLC — przekaźnik góra aktywny
        if self._fb_up and self.coordinator.data:
            val = self.coordinator.data.get(f"{self._name}_fb_up")
            if val is not None:
                return bool(int(val))
        return self._moving == "opening"

    @property
    def is_closing(self) -> bool:
        if self.is_closed:
            return False
        # Feedback z PLC — przekaźnik dół aktywny
        if self._fb_dn and self.coordinator.data:
            val = self.coordinator.data.get(f"{self._name}_fb_dn")
            if val is not None:
                return bool(int(val))
        return self._moving == "closing"

    @property
    def available(self) -> bool:
        return self.coordinator.last_update_success

    # ── Sterowanie ────────────────────────────────────────────────────────────

    async def async_open_cover(self, **kwargs: Any) -> None:
        if not self._up:
            return
        if await self.coordinator.async_write_value(CIRCUIT_SCD, self._up, self._val_up):
            self._moving = "opening"
            self.async_write_ha_state()

    async def async_close_cover(self, **kwargs: Any) -> None:
        if not self._down:
            return
        if await self.coordinator.async_write_value(CIRCUIT_SCD, self._down, self._val_down):
            self._moving = "closing"
            self.async_write_ha_state()

    async def async_stop_cover(self, **kwargs: Any) -> None:
        if not self._stop_q:
            return
        if await self.coordinator.async_write_value(CIRCUIT_SCD, self._stop_q, self._val_stop):
            self._moving = None
            self.async_write_ha_state()
