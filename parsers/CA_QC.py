from datetime import datetime
from logging import Logger, getLogger
from pprint import pprint
from typing import Any, Dict, List, Optional, Union

# The arrow library is used to handle datetimes
import arrow
from pytz import timezone
from requests import Session

from electricitymap.contrib.lib.models.event_lists import (
    ProductionBreakdownList,
    TotalConsumptionList,
)
from electricitymap.contrib.lib.models.events import ProductionMix
from electricitymap.contrib.lib.types import ZoneKey

US_PROXY = "https://us-ca-proxy-jfnx5klx2a-uw.a.run.app"
HOST_PARAM = "?host=https://hydroquebec.com"
DATA_PATH = "data/documents-donnees/donnees-ouvertes/json"
PRODUCTION_URL = f"{US_PROXY}/{DATA_PATH}/production.json{HOST_PARAM}"
CONSUMPTION_URL = f"{US_PROXY}/{DATA_PATH}/demande.json{HOST_PARAM}"
SOURCE = "hydroquebec.com"
TIMEZONE = timezone("America/Montreal")


def fetch_production(
    zone_key: ZoneKey = ZoneKey("CA-QC"),
    session: Optional[Session] = None,
    target_datetime: Optional[datetime] = None,
    logger: Logger = getLogger(__name__),
) -> List[Dict[str, Any]]:
    """Requests the last known production mix (in MW) of a given region."""

    data = _fetch_quebec_production(session)
    production = ProductionBreakdownList(logger)
    now = datetime.now(tz=TIMEZONE)
    for elem in data:
        values = elem["valeurs"]
        timestamp = arrow.get(elem["date"], tzinfo=TIMEZONE).datetime
        # The datasource returns future timestamps or recent with a 0.0 value, so we ignore them.
        if timestamp <= now and values.get("total", 0) > 0:
            production.append(
                zoneKey=zone_key,
                datetime=timestamp,
                production=ProductionMix(
                    # autres is all renewable, and mostly biomass.  See Github    #3218
                    biomass=values.get("autres", 0),
                    hydro=values.get("hydraulique", 0),
                    # See Github issue #3218, Québec's thermal generation is at Bécancour gas turbine.
                    # It is reported with a delay, and data source returning 0.0 can indicate either no generation or not-yet-reported generation.
                    gas=values.get("thermique", 0),
                    solar=values.get("solaire", 0),
                    wind=values.get("eolien", 0),
                ),
                source=SOURCE,
            )
    return production.to_list()


def fetch_consumption(
    zone_key: ZoneKey = ZoneKey("CA-QC"),
    session: Optional[Session] = None,
    target_datetime: Optional[datetime] = None,
    logger: Logger = getLogger(__name__),
):
    data = _fetch_quebec_consumption(session)

    consumption = TotalConsumptionList(logger)
    for elem in data:
        if "demandeTotal" in elem["valeurs"]:
            consumption.append(
                zoneKey=zone_key,
                datetime=arrow.get(elem["date"], tzinfo=TIMEZONE).datetime,
                consumption=elem["valeurs"]["demandeTotal"],
                source=SOURCE,
            )
    return consumption.to_list()


def _fetch_quebec_production(
    session: Optional[Session] = None, logger: Logger = getLogger(__name__)
) -> List[Dict[str, Union[str, Dict[str, float]]]]:
    s = session or Session()
    response = s.get(PRODUCTION_URL)

    if not response.ok:
        logger.info(
            "CA-QC: failed getting requested production data from hydroquebec - URL {}".format(
                PRODUCTION_URL
            )
        )
    return response.json()["details"]


def _fetch_quebec_consumption(
    session: Optional[Session] = None, logger: Logger = getLogger(__name__)
) -> List[Dict[str, Any]]:
    s = session or Session()
    response = s.get(CONSUMPTION_URL)

    if not response.ok:
        logger.info(
            "CA-QC: failed getting requested consumption data from hydroquebec - URL {}".format(
                CONSUMPTION_URL
            )
        )
    return response.json()["details"]


if __name__ == "__main__":
    """Main method, never used by the Electricity Map backend, but handy for testing."""

    test_logger = getLogger()

    print("fetch_production() ->")
    pprint(fetch_production(logger=test_logger))

    print("fetch_consumption() ->")
    pprint(fetch_consumption(logger=test_logger))
