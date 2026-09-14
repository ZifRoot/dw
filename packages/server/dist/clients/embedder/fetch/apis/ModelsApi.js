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
exports.ModelsApi = void 0;
const runtime = __importStar(require("../runtime"));
const LoadUnloadResponse_1 = require("../models/LoadUnloadResponse");
const ModelsListResponse_1 = require("../models/ModelsListResponse");
class ModelsApi extends runtime.BaseAPI {
    async getModelsModelsGetRequestOpts() {
        const queryParameters = {};
        const headerParameters = {};
        let urlPath = `/models`;
        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }
    async getModelsModelsGetRaw(initOverrides) {
        const requestOptions = await this.getModelsModelsGetRequestOpts();
        const response = await this.request(requestOptions, initOverrides);
        return new runtime.JSONApiResponse(response, (jsonValue) => (0, ModelsListResponse_1.ModelsListResponseFromJSON)(jsonValue));
    }
    async getModelsModelsGet(initOverrides) {
        const response = await this.getModelsModelsGetRaw(initOverrides);
        return await response.value();
    }
    async loadModelModelsModelNameLoadPostRequestOpts(requestParameters) {
        if (requestParameters['modelName'] == null) {
            throw new runtime.RequiredError('modelName', 'Required parameter "modelName" was null or undefined when calling loadModelModelsModelNameLoadPost().');
        }
        const queryParameters = {};
        const headerParameters = {};
        let urlPath = `/models/{model_name}/load`;
        urlPath = urlPath.replace('{model_name}', encodeURIComponent(String(requestParameters['modelName'])));
        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
        };
    }
    async loadModelModelsModelNameLoadPostRaw(requestParameters, initOverrides) {
        const requestOptions = await this.loadModelModelsModelNameLoadPostRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);
        return new runtime.JSONApiResponse(response, (jsonValue) => (0, LoadUnloadResponse_1.LoadUnloadResponseFromJSON)(jsonValue));
    }
    async loadModelModelsModelNameLoadPost(requestParameters, initOverrides) {
        const response = await this.loadModelModelsModelNameLoadPostRaw(requestParameters, initOverrides);
        return await response.value();
    }
    async unloadModelModelsModelNameUnloadPostRequestOpts(requestParameters) {
        if (requestParameters['modelName'] == null) {
            throw new runtime.RequiredError('modelName', 'Required parameter "modelName" was null or undefined when calling unloadModelModelsModelNameUnloadPost().');
        }
        const queryParameters = {};
        const headerParameters = {};
        let urlPath = `/models/{model_name}/unload`;
        urlPath = urlPath.replace('{model_name}', encodeURIComponent(String(requestParameters['modelName'])));
        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
        };
    }
    async unloadModelModelsModelNameUnloadPostRaw(requestParameters, initOverrides) {
        const requestOptions = await this.unloadModelModelsModelNameUnloadPostRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);
        return new runtime.JSONApiResponse(response, (jsonValue) => (0, LoadUnloadResponse_1.LoadUnloadResponseFromJSON)(jsonValue));
    }
    async unloadModelModelsModelNameUnloadPost(requestParameters, initOverrides) {
        const response = await this.unloadModelModelsModelNameUnloadPostRaw(requestParameters, initOverrides);
        return await response.value();
    }
}
exports.ModelsApi = ModelsApi;
