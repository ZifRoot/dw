"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfLocationInner = instanceOfLocationInner;
exports.LocationInnerFromJSON = LocationInnerFromJSON;
exports.LocationInnerFromJSONTyped = LocationInnerFromJSONTyped;
exports.LocationInnerToJSON = LocationInnerToJSON;
exports.LocationInnerToJSONTyped = LocationInnerToJSONTyped;
function instanceOfLocationInner(value) {
    return true;
}
function LocationInnerFromJSON(json) {
    return LocationInnerFromJSONTyped(json, false);
}
function LocationInnerFromJSONTyped(json, ignoreDiscriminator) {
    return json;
}
function LocationInnerToJSON(json) {
    return LocationInnerToJSONTyped(json, false);
}
function LocationInnerToJSONTyped(value, ignoreDiscriminator = false) {
    return value;
}
