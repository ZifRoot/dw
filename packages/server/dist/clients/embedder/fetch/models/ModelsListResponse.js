"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfModelsListResponse = instanceOfModelsListResponse;
exports.ModelsListResponseFromJSON = ModelsListResponseFromJSON;
exports.ModelsListResponseFromJSONTyped = ModelsListResponseFromJSONTyped;
exports.ModelsListResponseToJSON = ModelsListResponseToJSON;
exports.ModelsListResponseToJSONTyped = ModelsListResponseToJSONTyped;
const ModelInfo_1 = require("./ModelInfo");
function instanceOfModelsListResponse(value) {
    if (!('models' in value) || value['models'] === undefined)
        return false;
    return true;
}
function ModelsListResponseFromJSON(json) {
    return ModelsListResponseFromJSONTyped(json, false);
}
function ModelsListResponseFromJSONTyped(json, ignoreDiscriminator) {
    if (json == null) {
        return json;
    }
    return {
        'models': (json['models'].map(ModelInfo_1.ModelInfoFromJSON)),
    };
}
function ModelsListResponseToJSON(json) {
    return ModelsListResponseToJSONTyped(json, false);
}
function ModelsListResponseToJSONTyped(value, ignoreDiscriminator = false) {
    if (value == null) {
        return value;
    }
    return {
        'models': (value['models'].map(ModelInfo_1.ModelInfoToJSON)),
    };
}
