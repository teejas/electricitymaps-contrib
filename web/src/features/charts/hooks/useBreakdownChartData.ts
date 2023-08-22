import useGetZone from 'api/getZone';
import { max as d3Max } from 'd3-array';
import type { ScaleLinear } from 'd3-scale';
import { useCo2ColorScale } from 'hooks/theme';
import { useAtom } from 'jotai';
import {
  ElectricityModeType,
  ElectricityStorageKeyType,
  ElectricityStorageType,
  ZoneDetail,
} from 'types';

import { useParams } from 'react-router-dom';
import { Mode, SpatialAggregate, modeColor, modeOrder } from 'utils/constants';
import { scalePower } from 'utils/formatting';
import {
  displayByEmissionsAtom,
  productionConsumptionAtom,
  spatialAggregateAtom,
} from 'utils/state/atoms';
import { getExchangesToDisplay } from '../bar-breakdown/utils';
import { getGenerationTypeKey } from '../graphUtils';
import { AreaGraphElement, LayerKey } from '../types';

export const getLayerFill =
  (co2ColorScale: ScaleLinear<string, string, string>) => (key: LayerKey) => {
    // Use regular production fill.
    if (key in modeColor) {
      return () => modeColor[key as ElectricityModeType];
    }
    // Otherwise it's an exchange, set the horizontal gradient by using a different fill for each datapoint.
    return (d: { data: AreaGraphElement }) =>
      co2ColorScale(d.data.meta.exchangeCo2Intensities?.[key]);
  };

export default function useBreakdownChartData() {
  const { data: zoneData, isLoading, isError } = useGetZone();
  const co2ColorScale = useCo2ColorScale();
  const { zoneId } = useParams();
  const [mixMode] = useAtom(productionConsumptionAtom);
  const [displayByEmissions] = useAtom(displayByEmissionsAtom);
  const [viewMode] = useAtom(spatialAggregateAtom);
  const isCountryView = viewMode === SpatialAggregate.COUNTRY;
  if (isLoading || isError || !zoneData || !zoneId) {
    return { isLoading, isError };
  }

  const exchangesForSelectedAggregate = getExchangesToDisplay(
    zoneId,
    isCountryView,
    zoneData.zoneStates
  );

  const { valueFactor, valueAxisLabel } = getValuesInfo(
    Object.values(zoneData.zoneStates),
    displayByEmissions
  );

  const chartData: AreaGraphElement[] = [];
  const exchangeKeys: string[] = exchangesForSelectedAggregate;

  for (const [datetimeString, value] of Object.entries(zoneData.zoneStates)) {
    const datetime = new Date(datetimeString);
    const entry: AreaGraphElement = {
      datetime,
      meta: value,
      layerData: {},
    };

    for (const mode of modeOrder) {
      const isStorage = mode.includes('storage');

      // TODO: handle storage
      entry.layerData[mode] = isStorage
        ? getStorageValue(
            mode as ElectricityStorageType,
            value,
            valueFactor,
            displayByEmissions
          )
        : getGenerationValue(mode, value, valueFactor, displayByEmissions);
    }

    if (mixMode === Mode.CONSUMPTION) {
      // Add exchanges
      for (const [key, exchangeValue] of Object.entries(value.exchange)) {
        // in GW or MW
        entry.layerData[key] = Math.max(0, exchangeValue / valueFactor);
        if (displayByEmissions) {
          // in tCO₂eq/min
          entry.layerData[key] *= (value.exchangeCo2Intensities || {})[key] / 1e3 / 60;
        }
      }
    }
    chartData.push(entry);
  }

  const layerKeys: string[] = [...modeOrder, ...exchangeKeys];

  // Ensure that all chart data entries contains all layer keys
  for (const entry of chartData) {
    for (const key of layerKeys) {
      if (!(key in entry.layerData)) {
        entry.layerData[key] = Number.NaN;
      }
    }
  }

  const result = {
    chartData,
    layerKeys,
    layerFill: getLayerFill(co2ColorScale),
    // markerFill,
    valueAxisLabel,
    layerStroke: undefined,
  };

  return { data: result, mixMode, isLoading, isError };
}

function getStorageValue(
  key: ElectricityStorageType,
  value: ZoneDetail,
  valueFactor: number,
  displayByEmissions: boolean
) {
  const storageKey = key.replace(' storage', '') as ElectricityStorageKeyType;
  const storageValue = value.storage?.[storageKey];
  if (storageValue === undefined || storageValue === null) {
    return Number.NaN;
  }

  let scaledValue = (-1 * Math.min(0, storageValue)) / valueFactor;

  if (displayByEmissions) {
    scaledValue *= value.dischargeCo2Intensities[storageKey] / 1e3 / 60;
  }

  return scaledValue;
}

function getGenerationValue(
  key: string,
  value: ZoneDetail,
  valueFactor: number,
  displayByEmissions: boolean
) {
  const generationKey = getGenerationTypeKey(key);
  if (generationKey === undefined) {
    return Number.NaN;
  }

  const modeProduction = value.production[generationKey];

  if (modeProduction === undefined || modeProduction === null) {
    return Number.NaN;
  }

  let scaledValue = modeProduction / valueFactor;

  if (displayByEmissions) {
    scaledValue *= value.productionCo2Intensities[generationKey] / 1e3 / 60;
  }

  return scaledValue;
}

interface ValuesInfo {
  valueAxisLabel: string; // For example, GW or tCO₂eq/min
  valueFactor: number;
}

function getValuesInfo(
  historyData: ZoneDetail[],
  displayByEmissions: boolean
): ValuesInfo {
  const maxTotalValue = d3Max(
    historyData,
    (d: ZoneDetail) =>
      displayByEmissions
        ? (d.totalCo2Production + d.totalCo2Import + d.totalCo2Discharge) / 1e6 / 60 // in tCO₂eq/min
        : d.totalProduction + d.totalImport + d.totalDischarge // in MW
  );

  const format = scalePower(maxTotalValue);
  const valueAxisLabel = displayByEmissions ? 'tCO₂eq / min' : format.unit;
  const valueFactor = format.formattingFactor;
  return { valueAxisLabel, valueFactor };
}
