"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfModelInfo = instanceOfModelInfo;
exports.ModelInfoFromJSON = ModelInfoFromJSON;
exports.ModelInfoFromJSONTyped = ModelInfoFromJSONTyped;
exports.ModelInfoToJSON = ModelInfoToJSON;
exports.ModelInfoToJSONTyped = ModelInfoToJSONTyped;
function instanceOfModelInfo(value) {
    if (!('name' in value) || value['name'] === undefined)
        return false;
    if (!('status' in value) || value['status'] === undefined)
        return false;
    return true;
}
function ModelInfoFromJSON(json) {
    return ModelInfoFromJSONTyped(json, false);
}
function ModelInfoFromJSONTyped(json, ignoreDiscriminator) {
    if (json == null) {
        return json;
    }
    return {
        'name': json['name'],
        'status': json['status'],
        'maxLength': json['max_length'] == null ? undefined : json['max_length'],
    };
}
function ModelInfoToJSON(json) {
    return ModelInfoToJSONTyped(json, false);
}
function ModelInfoToJSONTyped(value, ignoreDiscriminator = false) {
    if (value == null) {
        return value;
    }
    return {
        'name': value['name'],
        'status': value['status'],
        'max_length': value['maxLength'],
    };
}
