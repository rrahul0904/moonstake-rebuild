import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_COORDINATES,
  PLANETARY_DATA_CONTRACT_VERSION,
  buildFeatureStableKey,
  featureCanReceiveRegistryPremium,
  normalizeEastLongitude,
  normalizeUsgsGazetteerFeature,
} from '../src/planetary-data.mjs';

test('planetary ingestion contract is versioned and uses one canonical coordinate convention',()=>{
  assert.equal(PLANETARY_DATA_CONTRACT_VERSION,'2026-09-21');
  assert.deepEqual(CANONICAL_COORDINATES,{
    latitudeType:'planetocentric',
    longitudeDirection:'positive-east',
    longitudeDomain:'-180..180',
  });
});

test('east longitude converts deterministically from 0-360 to -180..180',()=>{
  assert.equal(normalizeEastLongitude(0),0);
  assert.equal(normalizeEastLongitude(359),-1);
  assert.equal(normalizeEastLongitude(181),-179);
  assert.equal(normalizeEastLongitude(-181),179);
});

test('official feature import preserves provenance and maps to a stable registry position',()=>{
  const feature=normalizeUsgsGazetteerFeature({
    bodyId:'mars',
    featureId:'12345',
    officialName:'Example Mons',
    featureType:'Mons, montes',
    approvalStatus:'Adopted by IAU',
    approvalDate:'2026-01-01',
    centerLatitude:0,
    centerLongitudeEast:180,
    diameterKm:100,
    coordinateSystem:'Planetocentric, +East, 0 - 360',
    sourceVersion:'2026-09-21',
  });
  assert.equal(feature.bodyId,'mars');
  assert.equal(feature.longitude,-180);
  assert.equal(feature.registryPositionId,'MARS-000-180');
  assert.equal(buildFeatureStableKey(feature),'mars:usgs-iau:12345');
  assert.equal(featureCanReceiveRegistryPremium(feature),true);
});

test('non-adopted nomenclature is excluded from premium inventory by default',()=>{
  assert.throws(()=>normalizeUsgsGazetteerFeature({
    bodyId:'mars',
    featureId:'draft-1',
    officialName:'Draft Feature',
    featureType:'Crater',
    approvalStatus:'Never approved by the IAU',
    centerLatitude:0,
    centerLongitudeEast:0,
  }),/only IAU-adopted/);
});

test('Earth remains reference-only in the commercial feature importer',()=>{
  assert.throws(()=>normalizeUsgsGazetteerFeature({
    bodyId:'earth',
    featureId:'1',
    officialName:'Example',
    featureType:'Reference',
    approvalStatus:'Adopted by IAU',
    centerLatitude:0,
    centerLongitudeEast:0,
  }),/reference-only/);
});

test('observation bodies keep official features without pretending they map to land lots',()=>{
  const feature=normalizeUsgsGazetteerFeature({
    bodyId:'jupiter',
    featureId:'j-1',
    officialName:'Example Atmospheric Feature',
    featureType:'Feature',
    approvalStatus:'Adopted by IAU',
    centerLatitude:10,
    centerLongitudeEast:20,
  });
  assert.equal(feature.registryPositionId,null);
  assert.equal(featureCanReceiveRegistryPremium(feature),false);
});
