"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelsApi = exports.ModelsApiFactory = exports.ModelsApiFp = exports.ModelsApiAxiosParamCreator = exports.EmbeddingsApi = exports.EmbeddingsApiFactory = exports.EmbeddingsApiFp = exports.EmbeddingsApiAxiosParamCreator = void 0;
const axios_1 = __importDefault(require("axios"));
const common_1 = require("./common");
const base_1 = require("./base");
const EmbeddingsApiAxiosParamCreator = function (configuration) {
    return {
        createTaskEmbeddingsPost: async (computeRequest, options = {}) => {
            (0, common_1.assertParamExists)('createTaskEmbeddingsPost', 'computeRequest', computeRequest);
            const localVarPath = `/embeddings`;
            const localVarUrlObj = new URL(localVarPath, common_1.DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }
            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options };
            const localVarHeaderParameter = {};
            const localVarQueryParameter = {};
            localVarHeaderParameter['Content-Type'] = 'application/json';
            localVarHeaderParameter['Accept'] = 'application/json';
            (0, common_1.setSearchParams)(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = { ...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers };
            localVarRequestOptions.data = (0, common_1.serializeDataIfNeeded)(computeRequest, localVarRequestOptions, configuration);
            return {
                url: (0, common_1.toPathString)(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
        deleteTaskEmbeddingsTaskIdDelete: async (taskId, options = {}) => {
            (0, common_1.assertParamExists)('deleteTaskEmbeddingsTaskIdDelete', 'taskId', taskId);
            const localVarPath = `/embeddings/{task_id}`
                .replace('{task_id}', encodeURIComponent(String(taskId)));
            const localVarUrlObj = new URL(localVarPath, common_1.DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }
            const localVarRequestOptions = { method: 'DELETE', ...baseOptions, ...options };
            const localVarHeaderParameter = {};
            const localVarQueryParameter = {};
            localVarHeaderParameter['Accept'] = 'application/json';
            (0, common_1.setSearchParams)(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = { ...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers };
            return {
                url: (0, common_1.toPathString)(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
        getTaskEmbeddingsTaskIdGet: async (taskId, options = {}) => {
            (0, common_1.assertParamExists)('getTaskEmbeddingsTaskIdGet', 'taskId', taskId);
            const localVarPath = `/embeddings/{task_id}`
                .replace('{task_id}', encodeURIComponent(String(taskId)));
            const localVarUrlObj = new URL(localVarPath, common_1.DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }
            const localVarRequestOptions = { method: 'GET', ...baseOptions, ...options };
            const localVarHeaderParameter = {};
            const localVarQueryParameter = {};
            localVarHeaderParameter['Accept'] = 'application/json';
            (0, common_1.setSearchParams)(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = { ...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers };
            return {
                url: (0, common_1.toPathString)(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
        listTasksEmbeddingsGet: async (statusFilter, options = {}) => {
            const localVarPath = `/embeddings`;
            const localVarUrlObj = new URL(localVarPath, common_1.DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }
            const localVarRequestOptions = { method: 'GET', ...baseOptions, ...options };
            const localVarHeaderParameter = {};
            const localVarQueryParameter = {};
            if (statusFilter !== undefined) {
                localVarQueryParameter['status_filter'] = statusFilter;
            }
            localVarHeaderParameter['Accept'] = 'application/json';
            (0, common_1.setSearchParams)(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = { ...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers };
            return {
                url: (0, common_1.toPathString)(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
    };
};
exports.EmbeddingsApiAxiosParamCreator = EmbeddingsApiAxiosParamCreator;
const EmbeddingsApiFp = function (configuration) {
    const localVarAxiosParamCreator = (0, exports.EmbeddingsApiAxiosParamCreator)(configuration);
    return {
        async createTaskEmbeddingsPost(computeRequest, options) {
            const localVarAxiosArgs = await localVarAxiosParamCreator.createTaskEmbeddingsPost(computeRequest, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = base_1.operationServerMap['EmbeddingsApi.createTaskEmbeddingsPost']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => (0, common_1.createRequestFunction)(localVarAxiosArgs, axios_1.default, base_1.BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
        async deleteTaskEmbeddingsTaskIdDelete(taskId, options) {
            const localVarAxiosArgs = await localVarAxiosParamCreator.deleteTaskEmbeddingsTaskIdDelete(taskId, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = base_1.operationServerMap['EmbeddingsApi.deleteTaskEmbeddingsTaskIdDelete']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => (0, common_1.createRequestFunction)(localVarAxiosArgs, axios_1.default, base_1.BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
        async getTaskEmbeddingsTaskIdGet(taskId, options) {
            const localVarAxiosArgs = await localVarAxiosParamCreator.getTaskEmbeddingsTaskIdGet(taskId, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = base_1.operationServerMap['EmbeddingsApi.getTaskEmbeddingsTaskIdGet']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => (0, common_1.createRequestFunction)(localVarAxiosArgs, axios_1.default, base_1.BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
        async listTasksEmbeddingsGet(statusFilter, options) {
            const localVarAxiosArgs = await localVarAxiosParamCreator.listTasksEmbeddingsGet(statusFilter, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = base_1.operationServerMap['EmbeddingsApi.listTasksEmbeddingsGet']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => (0, common_1.createRequestFunction)(localVarAxiosArgs, axios_1.default, base_1.BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
    };
};
exports.EmbeddingsApiFp = EmbeddingsApiFp;
const EmbeddingsApiFactory = function (configuration, basePath, axios) {
    const localVarFp = (0, exports.EmbeddingsApiFp)(configuration);
    return {
        createTaskEmbeddingsPost(computeRequest, options) {
            return localVarFp.createTaskEmbeddingsPost(computeRequest, options).then((request) => request(axios, basePath));
        },
        deleteTaskEmbeddingsTaskIdDelete(taskId, options) {
            return localVarFp.deleteTaskEmbeddingsTaskIdDelete(taskId, options).then((request) => request(axios, basePath));
        },
        getTaskEmbeddingsTaskIdGet(taskId, options) {
            return localVarFp.getTaskEmbeddingsTaskIdGet(taskId, options).then((request) => request(axios, basePath));
        },
        listTasksEmbeddingsGet(statusFilter, options) {
            return localVarFp.listTasksEmbeddingsGet(statusFilter, options).then((request) => request(axios, basePath));
        },
    };
};
exports.EmbeddingsApiFactory = EmbeddingsApiFactory;
class EmbeddingsApi extends base_1.BaseAPI {
    createTaskEmbeddingsPost(computeRequest, options) {
        return (0, exports.EmbeddingsApiFp)(this.configuration).createTaskEmbeddingsPost(computeRequest, options).then((request) => request(this.axios, this.basePath));
    }
    deleteTaskEmbeddingsTaskIdDelete(taskId, options) {
        return (0, exports.EmbeddingsApiFp)(this.configuration).deleteTaskEmbeddingsTaskIdDelete(taskId, options).then((request) => request(this.axios, this.basePath));
    }
    getTaskEmbeddingsTaskIdGet(taskId, options) {
        return (0, exports.EmbeddingsApiFp)(this.configuration).getTaskEmbeddingsTaskIdGet(taskId, options).then((request) => request(this.axios, this.basePath));
    }
    listTasksEmbeddingsGet(statusFilter, options) {
        return (0, exports.EmbeddingsApiFp)(this.configuration).listTasksEmbeddingsGet(statusFilter, options).then((request) => request(this.axios, this.basePath));
    }
}
exports.EmbeddingsApi = EmbeddingsApi;
const ModelsApiAxiosParamCreator = function (configuration) {
    return {
        getModelsModelsGet: async (options = {}) => {
            const localVarPath = `/models`;
            const localVarUrlObj = new URL(localVarPath, common_1.DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }
            const localVarRequestOptions = { method: 'GET', ...baseOptions, ...options };
            const localVarHeaderParameter = {};
            const localVarQueryParameter = {};
            localVarHeaderParameter['Accept'] = 'application/json';
            (0, common_1.setSearchParams)(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = { ...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers };
            return {
                url: (0, common_1.toPathString)(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
        loadModelModelsModelNameLoadPost: async (modelName, options = {}) => {
            (0, common_1.assertParamExists)('loadModelModelsModelNameLoadPost', 'modelName', modelName);
            const localVarPath = `/models/{model_name}/load`
                .replace('{model_name}', encodeURIComponent(String(modelName)));
            const localVarUrlObj = new URL(localVarPath, common_1.DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }
            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options };
            const localVarHeaderParameter = {};
            const localVarQueryParameter = {};
            localVarHeaderParameter['Accept'] = 'application/json';
            (0, common_1.setSearchParams)(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = { ...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers };
            return {
                url: (0, common_1.toPathString)(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
        unloadModelModelsModelNameUnloadPost: async (modelName, options = {}) => {
            (0, common_1.assertParamExists)('unloadModelModelsModelNameUnloadPost', 'modelName', modelName);
            const localVarPath = `/models/{model_name}/unload`
                .replace('{model_name}', encodeURIComponent(String(modelName)));
            const localVarUrlObj = new URL(localVarPath, common_1.DUMMY_BASE_URL);
            let baseOptions;
            if (configuration) {
                baseOptions = configuration.baseOptions;
            }
            const localVarRequestOptions = { method: 'POST', ...baseOptions, ...options };
            const localVarHeaderParameter = {};
            const localVarQueryParameter = {};
            localVarHeaderParameter['Accept'] = 'application/json';
            (0, common_1.setSearchParams)(localVarUrlObj, localVarQueryParameter);
            let headersFromBaseOptions = baseOptions && baseOptions.headers ? baseOptions.headers : {};
            localVarRequestOptions.headers = { ...localVarHeaderParameter, ...headersFromBaseOptions, ...options.headers };
            return {
                url: (0, common_1.toPathString)(localVarUrlObj),
                options: localVarRequestOptions,
            };
        },
    };
};
exports.ModelsApiAxiosParamCreator = ModelsApiAxiosParamCreator;
const ModelsApiFp = function (configuration) {
    const localVarAxiosParamCreator = (0, exports.ModelsApiAxiosParamCreator)(configuration);
    return {
        async getModelsModelsGet(options) {
            const localVarAxiosArgs = await localVarAxiosParamCreator.getModelsModelsGet(options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = base_1.operationServerMap['ModelsApi.getModelsModelsGet']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => (0, common_1.createRequestFunction)(localVarAxiosArgs, axios_1.default, base_1.BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
        async loadModelModelsModelNameLoadPost(modelName, options) {
            const localVarAxiosArgs = await localVarAxiosParamCreator.loadModelModelsModelNameLoadPost(modelName, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = base_1.operationServerMap['ModelsApi.loadModelModelsModelNameLoadPost']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => (0, common_1.createRequestFunction)(localVarAxiosArgs, axios_1.default, base_1.BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
        async unloadModelModelsModelNameUnloadPost(modelName, options) {
            const localVarAxiosArgs = await localVarAxiosParamCreator.unloadModelModelsModelNameUnloadPost(modelName, options);
            const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
            const localVarOperationServerBasePath = base_1.operationServerMap['ModelsApi.unloadModelModelsModelNameUnloadPost']?.[localVarOperationServerIndex]?.url;
            return (axios, basePath) => (0, common_1.createRequestFunction)(localVarAxiosArgs, axios_1.default, base_1.BASE_PATH, configuration)(axios, localVarOperationServerBasePath || basePath);
        },
    };
};
exports.ModelsApiFp = ModelsApiFp;
const ModelsApiFactory = function (configuration, basePath, axios) {
    const localVarFp = (0, exports.ModelsApiFp)(configuration);
    return {
        getModelsModelsGet(options) {
            return localVarFp.getModelsModelsGet(options).then((request) => request(axios, basePath));
        },
        loadModelModelsModelNameLoadPost(modelName, options) {
            return localVarFp.loadModelModelsModelNameLoadPost(modelName, options).then((request) => request(axios, basePath));
        },
        unloadModelModelsModelNameUnloadPost(modelName, options) {
            return localVarFp.unloadModelModelsModelNameUnloadPost(modelName, options).then((request) => request(axios, basePath));
        },
    };
};
exports.ModelsApiFactory = ModelsApiFactory;
class ModelsApi extends base_1.BaseAPI {
    getModelsModelsGet(options) {
        return (0, exports.ModelsApiFp)(this.configuration).getModelsModelsGet(options).then((request) => request(this.axios, this.basePath));
    }
    loadModelModelsModelNameLoadPost(modelName, options) {
        return (0, exports.ModelsApiFp)(this.configuration).loadModelModelsModelNameLoadPost(modelName, options).then((request) => request(this.axios, this.basePath));
    }
    unloadModelModelsModelNameUnloadPost(modelName, options) {
        return (0, exports.ModelsApiFp)(this.configuration).unloadModelModelsModelNameUnloadPost(modelName, options).then((request) => request(this.axios, this.basePath));
    }
}
exports.ModelsApi = ModelsApi;
