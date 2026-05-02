import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

def get_latest_wind_components(xml_text: str) -> dict[str, str | None]:
    if not xml_text:
        return {"U": None, "V": None}

    ns = {
        "wcs": "http://www.opengis.net/wcs/2.0",
        "ows": "http://www.opengis.net/ows/2.0",
    }

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return {"U": None, "V": None}

    u_latest: tuple[datetime | None, str | None] = (None, None)
    v_latest: tuple[datetime | None, str | None] = (None, None)

    for cs in root.findall(".//wcs:CoverageSummary", ns):
        if cs is None:
            continue

        cov_id_el = cs.find("wcs:CoverageId", ns)
        if cov_id_el is None:
            continue

        cov_id = (cov_id_el.text or "").strip()
        if not cov_id:
            continue

        # extraction date sûre
        parts = cov_id.split("___")
        if not parts:
            continue

        date_str = parts[-1]
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%dT%H.%M.%SZ")
        except Exception:
            continue

        if cov_id.startswith("U_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___"):
            if u_latest[0] is None or dt > u_latest[0]:
                u_latest = (dt, cov_id)

        elif cov_id.startswith("V_COMPONENT_OF_WIND__SPECIFIC_HEIGHT_LEVEL_ABOVE_GROUND___"):
            if v_latest[0] is None or dt > v_latest[0]:
                v_latest = (dt, cov_id)

    return {
        "U": u_latest[1],
        "V": v_latest[1],
    }


def get_nearest_time(xml_text: str) -> str:
    if not xml_text:
        raise ValueError("xml_text vide")

    ns = {
        "gml": "http://www.opengis.net/gml/3.2",
        "gmlrgrid": "http://www.opengis.net/gml/3.3/rgrid",
    }

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        raise ValueError(f"XML invalide: {e}")

    # beginPosition
    begin_el = root.find(".//gml:beginPosition", ns)
    if begin_el is None or not begin_el.text:
        raise ValueError("beginPosition manquant")

    try:
        base_time = datetime.fromisoformat(begin_el.text.replace("Z", "+00:00"))
    except Exception as e:
        raise ValueError(f"beginPosition invalide: {e}")

    # coefficients time
    coeffs: list[int] | None = None

    for axis in root.findall(".//gmlrgrid:GeneralGridAxis", ns):
        if axis is None:
            continue

        axis_name_el = axis.find("gmlrgrid:gridAxesSpanned", ns)
        if axis_name_el is None or not axis_name_el.text:
            continue

        if axis_name_el.text.strip() == "time":
            coeffs_el = axis.find("gmlrgrid:coefficients", ns)
            if coeffs_el is None or not coeffs_el.text:
                continue

            try:
                coeffs = [int(x) for x in coeffs_el.text.split() if x.strip()]
            except Exception:
                raise ValueError("coefficients time invalides")

            break

    if not coeffs:
        raise ValueError("aucun coefficient temporel trouvé")

    now = datetime.now(timezone.utc)

    # sélection robuste
    def compute_dt(sec: int) -> datetime:
        return base_time + timedelta(seconds=sec)

    best = min(
        coeffs,
        key=lambda s: abs(compute_dt(s) - now)
    )

    exact_time = compute_dt(best)

    # format strict WCS
    return exact_time.strftime("%Y-%m-%dT%H:%M:%SZ")