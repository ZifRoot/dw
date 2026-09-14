"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instanceOfTasksListResponse = instanceOfTasksListResponse;
exports.TasksListResponseFromJSON = TasksListResponseFromJSON;
exports.TasksListResponseFromJSONTyped = TasksListResponseFromJSONTyped;
exports.TasksListResponseToJSON = TasksListResponseToJSON;
exports.TasksListResponseToJSONTyped = TasksListResponseToJSONTyped;
const TaskShortResponse_1 = require("./TaskShortResponse");
function instanceOfTasksListResponse(value) {
    if (!('tasks' in value) || value['tasks'] === undefined)
        return false;
    return true;
}
function TasksListResponseFromJSON(json) {
    return TasksListResponseFromJSONTyped(json, false);
}
function TasksListResponseFromJSONTyped(json, ignoreDiscriminator) {
    if (json == null) {
        return json;
    }
    return {
        'tasks': (json['tasks'].map(TaskShortResponse_1.TaskShortResponseFromJSON)),
    };
}
function TasksListResponseToJSON(json) {
    return TasksListResponseToJSONTyped(json, false);
}
function TasksListResponseToJSONTyped(value, ignoreDiscriminator = false) {
    if (value == null) {
        return value;
    }
    return {
        'tasks': (value['tasks'].map(TaskShortResponse_1.TaskShortResponseToJSON)),
    };
}
