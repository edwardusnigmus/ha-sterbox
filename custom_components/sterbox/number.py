"""Number — zapis analogowy @sca."""
from __future__ import annotations
import logging
from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from .const import (
    CIRCUIT_SCA, CONF_HOST, CONF_NAME, CONF_VARS, DOMAIN,
    ENTITY_NUMBER, VAR_CIRCUIT, VAR_ENTITY_TYPE, VAR_ICON,
    VAR_MAX, VAR_MIN, VAR_NAME, VAR_NUMBER_MODE, VAR_QUERY, VAR_STEP,
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
    entities = [
        SterboxNumber(coordinator, v, name, host, entry.entry_id)
        for v in config.get(CONF_VARS, [])
        if v.get(VAR_CIRCUIT) == CIRCUIT_SCA and v.get(VAR_ENTITY_TYPE) == ENTITY_NUMBER
    ]
    if entities:
        async_add_entities(entities)


class SterboxNumber(SterboxEntity, NumberEntity):
    def __init__(self, coordinator, var, instance_name, host, entry_id):
        super().__init__(coordinator, var, instance_name, host, entry_id)
        icon = var.get(VAR_ICON, "")
        if icon:
            self._attr_icon = icon
        self._query = var[VAR_QUERY]

        mode = var.get(VAR_NUMBER_MODE, "slider")

        if mode == "box":
            # Tryb tekstowy — bardzo szerokie granice, brak suwaka
            self._attr_native_min_value = var.get(VAR_MIN, -999999.0)
            self._attr_native_max_value = var.get(VAR_MAX,  999999.0)
            self._attr_native_step      = var.get(VAR_STEP, 0.01)
            self._attr_mode             = NumberMode.BOX
        else:
            # Tryb suwaka — z zakresem min/max
            self._attr_native_min_value = var.get(VAR_MIN, 0.0)
            self._attr_native_max_value = var.get(VAR_MAX, 100.0)
            self._attr_native_step      = var.get(VAR_STEP, 1.0)
            self._attr_mode             = NumberMode.SLIDER

        self._current = self._attr_native_min_value

    @property
    def native_value(self) -> float:
        return self._current

    async def async_set_native_value(self, value: float) -> None:
        if await self.coordinator.async_write_value(CIRCUIT_SCA, self._query, value):
            self._current = value
            self.async_write_ha_state()
