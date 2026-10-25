// Documents au format de l'API ENTSO-E (GL_MarketDocument), réduits à quelques points,
// pour les tests
export const A75 = `<?xml version="1.0" encoding="UTF-8"?>
<GL_MarketDocument xmlns="urn:iec62325.351:tc57wg16:451-6:generationloaddocument:3:0">
  <mRID>1</mRID>
  <type>A75</type>
  <process.processType>A16</process.processType>
  <createdDateTime>2026-10-24T08:00:00Z</createdDateTime>
  <TimeSeries>
    <mRID>1</mRID>
    <businessType>A01</businessType>
    <inBiddingZone_Domain.mRID codingScheme="A01">10YBE----------2</inBiddingZone_Domain.mRID>
    <curveType>A01</curveType>
    <MktPSRType><psrType>B14</psrType></MktPSRType>
    <Period>
      <timeInterval><start>2026-10-23T22:00Z</start><end>2026-10-23T23:00Z</end></timeInterval>
      <resolution>PT15M</resolution>
      <Point><position>1</position><quantity>3900</quantity></Point>
      <Point><position>2</position><quantity>3920</quantity></Point>
      <Point><position>3</position><quantity>3940</quantity></Point>
      <Point><position>4</position><quantity>3960</quantity></Point>
    </Period>
  </TimeSeries>
  <TimeSeries>
    <mRID>2</mRID>
    <businessType>A01</businessType>
    <inBiddingZone_Domain.mRID codingScheme="A01">10YBE----------2</inBiddingZone_Domain.mRID>
    <curveType>A03</curveType>
    <MktPSRType><psrType>B10</psrType></MktPSRType>
    <Period>
      <timeInterval><start>2026-10-23T22:00Z</start><end>2026-10-24T00:00Z</end></timeInterval>
      <resolution>PT60M</resolution>
      <Point><position>1</position><quantity>300</quantity></Point>
    </Period>
  </TimeSeries>
  <TimeSeries>
    <mRID>3</mRID>
    <businessType>A04</businessType>
    <outBiddingZone_Domain.mRID codingScheme="A01">10YBE----------2</outBiddingZone_Domain.mRID>
    <curveType>A01</curveType>
    <MktPSRType><psrType>B10</psrType></MktPSRType>
    <Period>
      <timeInterval><start>2026-10-23T22:00Z</start><end>2026-10-24T00:00Z</end></timeInterval>
      <resolution>PT60M</resolution>
      <Point><position>1</position><quantity>100</quantity></Point>
      <Point><position>2</position><quantity>500</quantity></Point>
    </Period>
  </TimeSeries>
  <TimeSeries>
    <mRID>4</mRID>
    <inBiddingZone_Domain.mRID codingScheme="A01">10YBE----------2</inBiddingZone_Domain.mRID>
    <curveType>A01</curveType>
    <MktPSRType><psrType>B19</psrType></MktPSRType>
    <Period>
      <timeInterval><start>2026-10-23T22:00Z</start><end>2026-10-24T00:00Z</end></timeInterval>
      <resolution>PT60M</resolution>
      <Point><position>1</position><quantity>1000</quantity></Point>
      <Point><position>2</position><quantity>1500</quantity></Point>
    </Period>
  </TimeSeries>
</GL_MarketDocument>`;

export const A73 = `<GL_MarketDocument>
  <createdDateTime>2026-10-24T08:05:00Z</createdDateTime>
  <TimeSeries>
    <mRID>1</mRID>
    <registeredResource.mRID codingScheme="A01">22WDOEL1000000X</registeredResource.mRID>
    <inBiddingZone_Domain.mRID codingScheme="A01">10YBE----------2</inBiddingZone_Domain.mRID>
    <curveType>A01</curveType>
    <MktPSRType>
      <psrType>B14</psrType>
      <PowerSystemResources>
        <mRID codingScheme="A01">22WDOEL1000000X</mRID>
        <name>DOEL 1</name>
      </PowerSystemResources>
    </MktPSRType>
    <Period>
      <timeInterval><start>2026-10-23T22:00Z</start><end>2026-10-23T23:00Z</end></timeInterval>
      <resolution>PT60M</resolution>
      <Point><position>1</position><quantity>445</quantity></Point>
    </Period>
  </TimeSeries>
</GL_MarketDocument>`;

export const A68 = `<GL_MarketDocument>
  <TimeSeries>
    <inBiddingZone_Domain.mRID codingScheme="A01">10YBE----------2</inBiddingZone_Domain.mRID>
    <MktPSRType><psrType>B14</psrType></MktPSRType>
    <Period>
      <timeInterval><start>2025-12-31T23:00Z</start><end>2026-12-31T23:00Z</end></timeInterval>
      <resolution>P1Y</resolution>
      <Point><position>1</position><quantity>3908</quantity></Point>
    </Period>
  </TimeSeries>
  <TimeSeries>
    <inBiddingZone_Domain.mRID codingScheme="A01">10YBE----------2</inBiddingZone_Domain.mRID>
    <MktPSRType><psrType>B19</psrType></MktPSRType>
    <Period>
      <timeInterval><start>2025-12-31T23:00Z</start><end>2026-12-31T23:00Z</end></timeInterval>
      <resolution>P1Y</resolution>
      <Point><position>1</position><quantity>3000</quantity></Point>
    </Period>
  </TimeSeries>
</GL_MarketDocument>`;

export const NO_DATA = `<Acknowledgement_MarketDocument>
  <mRID>x</mRID>
  <Reason><code>999</code><text>No matching data found for Data item ACTUAL_GENERATION_PER_UNIT</text></Reason>
</Acknowledgement_MarketDocument>`;
