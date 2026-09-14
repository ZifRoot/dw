"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfTaskDetailResponse = instanceOfTaskDetailResponse;
exports.TaskDetailResponseFromJSON = TaskDetailResponseFromJSON;
exports.TaskDetailResponseFromJSONTyped = TaskDetailResponseFromJSONTyped;
exports.TaskDetailResponseToJSON = TaskDetailResponseToJSON;
exports.TaskDetailResponseToJSONTyped = TaskDetailResponseToJSONTyped;
function instanceOfTaskDetailResponse(value) {
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
function TaskDetailResponseFromJSON(json) {
    return TaskDetailResponseFromJSONTyped(json, false);
}
function TaskDetailResponseFromJSONTyped(json, ignoreDiscriminator) {
    if (json == null) {
        return json;
    }
    return {
        'taskId': json['task_id'],
        'modelName': json['model_name'],
        'status': json['status'],
        'result': json['result'] == null ? undefined : json['result'],
        'error': json['error'] == null ? undefined : json['error'],
        'processingTimeMs': json['processing_time_ms'] == null ? undefined : json['processing_time_ms'],
        'createdAt': json['created_at'],
        'completedAt': json['completed_at'] == null ? undefined : json['completed_at'],
    };
}
function TaskDetailResponseToJSON(json) {
    return TaskDetailResponseToJSONTyped(json, false);
}
function TaskDetailResponseToJSONTyped(value, ignoreDiscriminator = false) {
    if (value == null) {
        return value;
    }
    return {
        'task_id': value['taskId'],
        'model_name': value['modelName'],
        'status': value['status'],
        'result': value['result'],
        'error': value['error'],
        'processing_time_ms': value['processingTimeMs'],
        'created_at': value['createdAt'],
        'completed_at': value['completedAt'],
    };
}
