"""Button — zapis cyfrowy @scd, jednorazowy impuls."""
from __future__ import annotations
import logging
from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from .const import CIRCUIT_SCD, CONF_HOST, CONF_NAME, CONF_VARS, DOMAIN, ENTITY_BUTTON, VAR_BUTTON_VALUE, VAR_CIRCUIT, VAR_ENTITY_TYPE, VAR_ICON, VAR_NAME, VAR_QUERY
from .coordinator import SterboxCoordinator
from .entity_base import SterboxEntity

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    config = {**entry.data, **(entry.options or {})}
    coordinator: SterboxCoordinator = hass.data[DOMAIN][entry.entry_id]
    name = config.get(CONF_NAME, entry.title)
    host = config.get(CONF_HOST, "")
    entities = [
        SterboxButton(coordinator, v, name, host, entry.entry_id)
        for v in config.get(CONF_VARS, [])
        if v.get(VAR_CIRCUIT) == CIRCUIT_SCD and v.get(VAR_ENTITY_TYPE) == ENTITY_BUTTON
    ]
    if entities:
        async_add_entities(entities)

class SterboxButton(SterboxEntity, ButtonEntity):
    def __init__(self, coordinator, var, instance_name, host, entry_id):
        super().__init__(coordinator, var, instance_name, host, entry_id)
        icon = var.get(VAR_ICON, "")
        if icon:
            self._attr_icon = icon
        self._query        = var[VAR_QUERY]
        self._button_value = var.get(VAR_BUTTON_VALUE, 1)

    async def async_press(self) -> None:
        await self.coordinator.async_write_value(CIRCUIT_SCD, self._query, self._button_value)
