"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingsApi = void 0;
const runtime = __importStar(require("../runtime"));
const ComputeRequest_1 = require("../models/ComputeRequest");
const TaskDetailResponse_1 = require("../models/TaskDetailResponse");
const TaskShortResponse_1 = require("../models/TaskShortResponse");
const TasksListResponse_1 = require("../models/TasksListResponse");
class EmbeddingsApi extends runtime.BaseAPI {
    async createTaskEmbeddingsPostRequestOpts(requestParameters) {
        if (requestParameters['computeRequest'] == null) {
            throw new runtime.RequiredError('computeRequest', 'Required parameter "computeRequest" was null or undefined when calling createTaskEmbeddingsPost().');
        }
        const queryParameters = {};
        const headerParameters = {};
        headerParameters['Content-Type'] = 'application/json';
        let urlPath = `/embeddings`;
        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: (0, ComputeRequest_1.ComputeRequestToJSON)(requestParameters['computeRequest']),
        };
    }
    async createTaskEmbeddingsPostRaw(requestParameters, initOverrides) {
        const requestOptions = await this.createTaskEmbeddingsPostRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);
        return new runtime.JSONApiResponse(response, (jsonValue) => (0, TaskShortResponse_1.TaskShortResponseFromJSON)(jsonValue));
    }
    async createTaskEmbeddingsPost(requestParameters, initOverrides) {
        const response = await this.createTaskEmbeddingsPostRaw(requestParameters, initOverrides);
        return await response.value();
    }
    async deleteTaskEmbeddingsTaskIdDeleteRequestOpts(requestParameters) {
        if (requestParameters['taskId'] == null) {
            throw new runtime.RequiredError('taskId', 'Required parameter "taskId" was null or undefined when calling deleteTaskEmbeddingsTaskIdDelete().');
        }
        const queryParameters = {};
        const headerParameters = {};
        let urlPath = `/embeddings/{task_id}`;
        urlPath = urlPath.replace('{task_id}', encodeURIComponent(String(requestParameters['taskId'])));
        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }
    async deleteTaskEmbeddingsTaskIdDeleteRaw(requestParameters, initOverrides) {
        const requestOptions = await this.deleteTaskEmbeddingsTaskIdDeleteRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);
        return new runtime.VoidApiResponse(response);
    }
    async deleteTaskEmbeddingsTaskIdDelete(requestParameters, initOverrides) {
        await this.deleteTaskEmbeddingsTaskIdDeleteRaw(requestParameters, initOverrides);
    }
    async getTaskEmbeddingsTaskIdGetRequestOpts(requestParameters) {
        if (requestParameters['taskId'] == null) {
            throw new runtime.RequiredError('taskId', 'Required parameter "taskId" was null or undefined when calling getTaskEmbeddingsTaskIdGet().');
        }
        const queryParameters = {};
        const headerParameters = {};
        let urlPath = `/embeddings/{task_id}`;
        urlPath = urlPath.replace('{task_id}', encodeURIComponent(String(requestParameters['taskId'])));
        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }
    async getTaskEmbeddingsTaskIdGetRaw(requestParameters, initOverrides) {
        const requestOptions = await this.getTaskEmbeddingsTaskIdGetRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);
        return new runtime.JSONApiResponse(response, (jsonValue) => (0, TaskDetailResponse_1.TaskDetailResponseFromJSON)(jsonValue));
    }
    async getTaskEmbeddingsTaskIdGet(requestParameters, initOverrides) {
        const response = await this.getTaskEmbeddingsTaskIdGetRaw(requestParameters, initOverrides);
        return await response.value();
    }
    async listTasksEmbeddingsGetRequestOpts(requestParameters) {
        const queryParameters = {};
        if (requestParameters['statusFilter'] != null) {
            queryParameters['status_filter'] = requestParameters['statusFilter'];
        }
        const headerParameters = {};
        let urlPath = `/embeddings`;
        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }
    async listTasksEmbeddingsGetRaw(requestParameters, initOverrides) {
        const requestOptions = await this.listTasksEmbeddingsGetRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);
        return new runtime.JSONApiResponse(response, (jsonValue) => (0, TasksListResponse_1.TasksListResponseFromJSON)(jsonValue));
    }
    async listTasksEmbeddingsGet(requestParameters = {}, initOverrides) {
        const response = await this.listTasksEmbeddingsGetRaw(requestParameters, initOverrides);
        return await response.value();
    }
}
exports.EmbeddingsApi = EmbeddingsApi;
