import { getBody, latLonToBodyLot } from './celestial-market.mjs';

export const PLANETARY_DATA_CONTRACT_VERSION='2026-09-21';

export const CANONICAL_COORDINATES=Object.freeze({
  latitudeType:'planetocentric',
  longitudeDirection:'positive-east',
  longitudeDomain:'-180..180',
});

export const FEATURE_SOURCE_AUTHORITIES=Object.freeze({
  USGS_IAU:'USGS/IAU Gazetteer of Planetary Nomenclature',
  NASA_PDS:'NASA Planetary Data System',
  JPL:'NASA/JPL',
});

function finite(value,label){
  const n=Number(value);
  if(!Number.isFinite(n))throw new Error(`${label} must be finite`);
  return n;
}

export function normalizeEastLongitude(value){
  const lon=finite(value,'longitude');
  return ((((lon+180)%360)+360)%360)-180;
}

export function normalizePlanetocentricLatitude(value){
  const lat=finite(value,'latitude');
  if(lat < -90 || lat > 90)throw new Error('latitude must be between -90 and 90');
  return lat;
}

export function normalizeUsgsGazetteerFeature(record,{includeNonAdopted=false}={}){
  if(!record || typeof record!=='object')throw new Error('feature record is required');
  const bodyId=String(record.bodyId||record.target||'').trim().toLowerCase();
  const body=getBody(bodyId);
  if(body.inventoryMode==='reference-only')throw new Error(`${body.name} is reference-only in Atlas 259`);

  const sourceFeatureId=String(record.featureId||record.sourceFeatureId||'').trim();
  const officialName=String(record.officialName||record.featureName||'').trim();
  const featureType=String(record.featureType||'').trim();
  const approvalStatus=String(record.approvalStatus||'').trim();
  const coordinateSystem=String(record.coordinateSystem||'Planetocentric, +East, 0 - 360').trim();

  if(!sourceFeatureId)throw new Error('source feature id is required');
  if(!officialName)throw new Error('official feature name is required');
  if(!featureType)throw new Error('feature type is required');
  if(!includeNonAdopted && !/adopted by iau/i.test(approvalStatus)){
    throw new Error('only IAU-adopted features are enabled by default');
  }

  // Atlas ingestion should consume the USGS GIS/KML convention: planetocentric,
  // positive-east coordinates. We retain the Gazetteer coordinate-system label
  // as provenance rather than silently pretending every historical display
  // coordinate convention is identical.
  const latitude=normalizePlanetocentricLatitude(record.centerLatitude ?? record.latitude);
  const longitude=normalizeEastLongitude(record.centerLongitudeEast ?? record.centerLongitude ?? record.longitude);
  const position=body.inventoryMode==='surface-lots'
    ? latLonToBodyLot(body.id,latitude,longitude)
    : null;

  const diameterKm=record.diameterKm == null ? null : finite(record.diameterKm,'diameterKm');
  if(diameterKm != null && diameterKm < 0)throw new Error('diameterKm must be non-negative');

  return Object.freeze({
    contractVersion:PLANETARY_DATA_CONTRACT_VERSION,
    bodyId:body.id,
    sourceAuthority:FEATURE_SOURCE_AUTHORITIES.USGS_IAU,
    sourceFeatureId,
    sourceVersion:String(record.sourceVersion||record.sourceUpdatedAt||'').trim()||null,
    officialName,
    featureType,
    approvalStatus:approvalStatus||null,
    approvalDate:String(record.approvalDate||'').trim()||null,
    coordinateSystem,
    canonicalCoordinates:CANONICAL_COORDINATES,
    latitude,
    longitude,
    diameterKm,
    registryPositionId:position?.id||null,
    registryX:position?.x??null,
    registryY:position?.y??null,
    origin:String(record.origin||'').trim()||null,
    reference:String(record.reference||'').trim()||null,
  });
}

export function buildFeatureStableKey(feature){
  if(!feature?.bodyId || !feature?.sourceFeatureId)throw new Error('normalized feature required');
  return `${feature.bodyId}:usgs-iau:${feature.sourceFeatureId}`;
}

export function featureCanReceiveRegistryPremium(feature){
  return Boolean(
    feature
    && /adopted by iau/i.test(String(feature.approvalStatus||''))
    && feature.registryPositionId
  );
}
