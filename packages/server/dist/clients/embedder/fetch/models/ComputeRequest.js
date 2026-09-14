"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfComputeRequest = instanceOfComputeRequest;
exports.ComputeRequestFromJSON = ComputeRequestFromJSON;
exports.ComputeRequestFromJSONTyped = ComputeRequestFromJSONTyped;
exports.ComputeRequestToJSON = ComputeRequestToJSON;
exports.ComputeRequestToJSONTyped = ComputeRequestToJSONTyped;
function instanceOfComputeRequest(value) {
    if (!('text' in value) || value['text'] === undefined)
        return false;
    if (!('modelName' in value) || value['modelName'] === undefined)
        return false;
    return true;
}
function ComputeRequestFromJSON(json) {
    return ComputeRequestFromJSONTyped(json, false);
}
function ComputeRequestFromJSONTyped(json, ignoreDiscriminator) {
    if (json == null) {
        return json;
    }
    return {
        'text': json['text'],
        'modelName': json['model_name'],
    };
}
function ComputeRequestToJSON(json) {
    return ComputeRequestToJSONTyped(json, false);
}
function ComputeRequestToJSONTyped(value, ignoreDiscriminator = false) {
    if (value == null) {
        return value;
    }
    return {
        'text': value['text'],
        'model_name': value['modelName'],
    };
}
