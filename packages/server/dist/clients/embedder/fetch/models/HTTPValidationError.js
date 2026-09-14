"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfHTTPValidationError = instanceOfHTTPValidationError;
exports.HTTPValidationErrorFromJSON = HTTPValidationErrorFromJSON;
exports.HTTPValidationErrorFromJSONTyped = HTTPValidationErrorFromJSONTyped;
exports.HTTPValidationErrorToJSON = HTTPValidationErrorToJSON;
exports.HTTPValidationErrorToJSONTyped = HTTPValidationErrorToJSONTyped;
const ValidationError_1 = require("./ValidationError");
function instanceOfHTTPValidationError(value) {
    return true;
}
function HTTPValidationErrorFromJSON(json) {
    return HTTPValidationErrorFromJSONTyped(json, false);
}
function HTTPValidationErrorFromJSONTyped(json, ignoreDiscriminator) {
    if (json == null) {
        return json;
    }
    return {
        'detail': json['detail'] == null ? undefined : (json['detail'].map(ValidationError_1.ValidationErrorFromJSON)),
    };
}
function HTTPValidationErrorToJSON(json) {
    return HTTPValidationErrorToJSONTyped(json, false);
}
function HTTPValidationErrorToJSONTyped(value, ignoreDiscriminator = false) {
    if (value == null) {
        return value;
    }
    return {
        'detail': value['detail'] == null ? undefined : (value['detail'].map(ValidationError_1.ValidationErrorToJSON)),
    };
}
