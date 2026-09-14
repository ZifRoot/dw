"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfLoadUnloadResponse = instanceOfLoadUnloadResponse;
exports.LoadUnloadResponseFromJSON = LoadUnloadResponseFromJSON;
exports.LoadUnloadResponseFromJSONTyped = LoadUnloadResponseFromJSONTyped;
exports.LoadUnloadResponseToJSON = LoadUnloadResponseToJSON;
exports.LoadUnloadResponseToJSONTyped = LoadUnloadResponseToJSONTyped;
function instanceOfLoadUnloadResponse(value) {
    if (!('status' in value) || value['status'] === undefined)
        return false;
    if (!('message' in value) || value['message'] === undefined)
        return false;
    return true;
}
function LoadUnloadResponseFromJSON(json) {
    return LoadUnloadResponseFromJSONTyped(json, false);
}
function LoadUnloadResponseFromJSONTyped(json, ignoreDiscriminator) {
    if (json == null) {
        return json;
    }
    return {
        'status': json['status'],
        'message': json['message'],
    };
}
function LoadUnloadResponseToJSON(json) {
    return LoadUnloadResponseToJSONTyped(json, false);
}
function LoadUnloadResponseToJSONTyped(value, ignoreDiscriminator = false) {
    if (value == null) {
        return value;
    }
    return {
        'status': value['status'],
        'message': value['message'],
    };
}
