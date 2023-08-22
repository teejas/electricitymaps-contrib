import useGetZone from 'api/getZone';
import { max as d3Max, min as d3Min } from 'd3-array';
import { scaleLinear } from 'd3-scale';
import { AreaGraphElement } from '../types';
import { getNetExchange, round } from 'utils/helpers';
import { ZoneDetail } from 'types';
import { scalePower } from 'utils/formatting';
import { displayByEmissionsAtom } from 'utils/state/atoms';
import { useAtom } from 'jotai';

export function getFills(data: AreaGraphElement[]) {
  const netExchangeMaxValue =
    d3Max<number>(Object.values(data).map((d) => d.layerData.netExchange || 0)) ?? 0;
  const netExchangeMinValue =
    d3Min<number>(Object.values(data).map((d) => d.layerData.netExchange || 0)) ?? 0;

  const netExchangeColorScale = scaleLinear<string>()
    .domain([netExchangeMinValue, 0, netExchangeMaxValue])
    .range(['gray', 'lightgray', '#616161']);

  const layerFill = (key: string) => (d: { data: AreaGraphElement }) =>
    netExchangeColorScale(d.data.layerData[key]);

  const markerFill = (key: string) => (d: { data: AreaGraphElement }) =>
    netExchangeColorScale(d.data.layerData[key]);

  return { layerFill, markerFill };
}

export function useNetExchangeChartData() {
  const { data: zoneData, isLoading, isError } = useGetZone();
  if (isLoading || isError) {
    return { isLoading, isError };
  }
  const [displayByEmissions] = useAtom(displayByEmissionsAtom);
  const { valueFactor, valueAxisLabel } = getValuesInfo(
    Object.values(zoneData.zoneStates),
    displayByEmissions
  );

  const chartData: AreaGraphElement[] = [];

  for (const [datetimeString, zoneDetail] of Object.entries(zoneData.zoneStates)) {
    const datetime = new Date(datetimeString);
    chartData.push({
      datetime,
      layerData: {
        netExchange: round(getNetExchange(zoneDetail, displayByEmissions) / valueFactor),
      },
      meta: zoneDetail,
    });
  }

  const { layerFill, markerFill } = getFills(chartData);

  const layerKeys = ['netExchange'];

  const result = {
    chartData,
    layerKeys,
    layerFill,
    markerFill,
    valueAxisLabel,
    layerStroke: undefined,
  };

  return { data: result, isLoading, isError };
}

interface ValuesInfo {
  valueAxisLabel: string; // For example, GW or tCO₂eq/min
  valueFactor: number;
}

function getValuesInfo(
  historyData: ZoneDetail[],
  displayByEmissions: boolean
): ValuesInfo {
  const maxTotalValue = d3Max(historyData, (d: ZoneDetail) =>
    Math.abs(getNetExchange(d, displayByEmissions))
  );

  const { unit, formattingFactor } = displayByEmissions
    ? {
        unit: 'tCO₂eq/min',
        formattingFactor: 1,
      }
    : scalePower(maxTotalValue);
  const valueAxisLabel = unit;
  const valueFactor = formattingFactor;

  return { valueAxisLabel, valueFactor };
}
