import * as d3 from 'd3-format';
import { translate } from '../translation/translation';
import { TimeAverages } from './constants';
import { PowerUnits } from './units';

const DEFAULT_NUM_DIGITS = 3;

export const formatPower = function (
  d: number,
  numberDigits: number = DEFAULT_NUM_DIGITS
) {
  // Assume MW input
  if (d == undefined || Number.isNaN(d)) {
    return d;
  }
  const power = `${d3.format(`.${numberDigits}s`)(d * 1e6)}W` //Add a space between the number and the unit
    .replace(/([A-Za-z])/, ' $1')
    .trim();
  return power;
};

export const formatCo2 = function (d: number, numberDigits: number = DEFAULT_NUM_DIGITS) {
  let value = d;
  // Assume gCO₂ / h input
  value /= 60; // Convert to gCO₂ / min
  value /= 1e6; // Convert to tCO₂ / min
  if (d == undefined || Number.isNaN(d)) {
    return d;
  }

  return value >= 1
    ? `${d3.format(`.${numberDigits}s`)(value)}t ${translate('ofCO2eqPerMinute')}` // a ton or more
    : `${d3.format(`.${numberDigits}s`)(value * 1e6)}g ${translate('ofCO2eqPerMinute')}`;
};

const scalePower = function (maxPower: number | undefined) {
  // Assume MW input
  if (maxPower == undefined) {
    return {
      unit: '?',
      formattingFactor: 1e3,
    };
  }
  // Use absolute value to handle negative values
  const value = Math.abs(maxPower);

  if (value < 1) {
    return {
      unit: PowerUnits.KILOWATTS,
      formattingFactor: 1e-3,
    };
  }

  if (value < 1e3) {
    return {
      unit: PowerUnits.MEGAWATTS,
      formattingFactor: 1,
    };
  }

  return {
    unit: PowerUnits.GIGAWATTS,
    formattingFactor: 1e3,
  };
};

const formatDate = function (date: Date, lang: string, time: string) {
  if (!isValidDate(date) || !time) {
    return '';
  }

  switch (time) {
    case TimeAverages.HOURLY: {
      return new Intl.DateTimeFormat(lang, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
    }
    // Instantiate below DateTimeFormat objects using UTC to avoid displaying
    // misleading time slider labels for users in UTC-negative offset timezones
    case TimeAverages.DAILY: {
      return new Intl.DateTimeFormat(lang, {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(date);
    }
    case TimeAverages.MONTHLY: {
      return new Intl.DateTimeFormat(lang, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    }
    case TimeAverages.YEARLY: {
      return new Intl.DateTimeFormat(lang, {
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    }
    default: {
      console.error(`${time} is not implemented`);
      return '';
    }
  }
};

const getLocaleNumberFormat = (lang: string, { unit, unitDisplay, range }: any) => {
  try {
    return new Intl.NumberFormat(lang, {
      style: 'unit',
      unit,
      unitDisplay: unitDisplay || 'long',
    }).format(range);
  } catch {
    // As Intl.NumberFormat with custom 'unit' is not supported in all browsers, we fallback to
    // a simple English based implementation
    const plural = range === 1 ? '' : 's';
    return `${range} ${unit}${plural}`;
  }
};

const formatTimeRange = (lang: string, timeAggregate: TimeAverages) => {
  // Note that not all browsers fully support all languages
  switch (timeAggregate) {
    case TimeAverages.HOURLY: {
      return getLocaleNumberFormat(lang, { unit: 'hour', range: 24 });
    }
    case TimeAverages.DAILY: {
      return getLocaleNumberFormat(lang, { unit: 'day', range: 30 });
    }
    case TimeAverages.MONTHLY: {
      return getLocaleNumberFormat(lang, { unit: 'month', range: 12 });
    }
    case TimeAverages.YEARLY: {
      return getLocaleNumberFormat(lang, {
        unit: 'year',
        range: new Date().getUTCFullYear() - 2017,
      });
    }
    default: {
      console.error(`${timeAggregate} is not implemented`);
      return '';
    }
  }
};

const formatDateTick = function (date: Date, lang: string, timeAggregate: TimeAverages) {
  if (!isValidDate(date) || !timeAggregate) {
    return '';
  }

  switch (timeAggregate) {
    case TimeAverages.HOURLY: {
      return new Intl.DateTimeFormat(lang, {
        timeStyle: 'short',
      }).format(date);
    }
    // Instantiate below DateTimeFormat objects using UTC to avoid displaying
    // misleading time slider labels for users in UTC-negative offset timezones
    case TimeAverages.DAILY: {
      return new Intl.DateTimeFormat(lang, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    }
    case TimeAverages.MONTHLY: {
      return lang === 'et'
        ? new Intl.DateTimeFormat(lang, {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })
            .formatToParts(date)
            .find((part) => part.type === 'month')?.value
        : new Intl.DateTimeFormat(lang, {
            month: 'short',
            timeZone: 'UTC',
          }).format(date);
    }
    case TimeAverages.YEARLY: {
      return new Intl.DateTimeFormat(lang, {
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date);
    }
    default: {
      console.error(`${timeAggregate} is not implemented`);
      return '';
    }
  }
};

function isValidDate(date: Date) {
  if (!date || !(date instanceof Date)) {
    return false;
  }

  if (!date?.getTime() || date?.getTime() <= 1) {
    return false;
  }

  return true;
}
/**
 * @param {string[]} dataSources - array of data sources.
 * @param {string} language - ISO 639-1 language code (`en`) or ISO 639-1 language code + ISO 3166-1 alpha-2 country code (`en-GB`).
 * @returns {string} formatted string of data sources.
 */
function formatDataSources(dataSources: string[], language: string) {
  return Intl.ListFormat === undefined
    ? dataSources.join(', ')
    : new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(
        dataSources
      );
}

export { scalePower, formatDate, formatTimeRange, formatDateTick, formatDataSources };
