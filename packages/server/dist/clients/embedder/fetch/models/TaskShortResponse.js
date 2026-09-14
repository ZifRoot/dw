"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfTaskShortResponse = instanceOfTaskShortResponse;
exports.TaskShortResponseFromJSON = TaskShortResponseFromJSON;
exports.TaskShortResponseFromJSONTyped = TaskShortResponseFromJSONTyped;
exports.TaskShortResponseToJSON = TaskShortResponseToJSON;
exports.TaskShortResponseToJSONTyped = TaskShortResponseToJSONTyped;
function instanceOfTaskShortResponse(value) {
    if (!('taskId' in value) || value['taskId'] === undefined)
        return false;
    if (!('modelName' in value) || value['modelName'] === undefined)
        return false;
    if (!('status' in value) || value['status'] === undefined)
        return false;
    if (!('createdAt' in value) || value['createdAt'] === undefined)
        return false;
    return true;
}
function TaskShortResponseFromJSON(json) {
    return TaskShortResponseFromJSONTyped(json, false);
}
function TaskShortResponseFromJSONTyped(json, ignoreDiscriminator) {
    if (json == null) {
        return json;
    }
    return {
        'taskId': json['task_id'],
        'modelName': json['model_name'],
        'status': json['status'],
        'createdAt': json['created_at'],
    };
}
function TaskShortResponseToJSON(json) {
    return TaskShortResponseToJSONTyped(json, false);
}
function TaskShortResponseToJSONTyped(value, ignoreDiscriminator = false) {
    if (value == null) {
        return value;
    }
    return {
        'task_id': value['taskId'],
        'model_name': value['modelName'],
        'status': value['status'],
        'created_at': value['createdAt'],
    };
}
