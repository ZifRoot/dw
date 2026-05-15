# ModelsApi

All URIs are relative to *http://localhost*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**getModelsModelsGet**](#getmodelsmodelsget) | **GET** /models | Get Models|
|[**loadModelModelsModelNameLoadPost**](#loadmodelmodelsmodelnameloadpost) | **POST** /models/{model_name}/load | Load Model|
|[**unloadModelModelsModelNameUnloadPost**](#unloadmodelmodelsmodelnameunloadpost) | **POST** /models/{model_name}/unload | Unload Model|

# **getModelsModelsGet**
> ModelsListResponse getModelsModelsGet()

Список моделей с их статусами.

### Example

```typescript
import {
    ModelsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ModelsApi(configuration);

const { status, data } = await apiInstance.getModelsModelsGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**ModelsListResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful Response |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **loadModelModelsModelNameLoadPost**
> LoadUnloadResponse loadModelModelsModelNameLoadPost()

Загружает модель в память GPU.

### Example

```typescript
import {
    ModelsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ModelsApi(configuration);

let modelName: string; // (default to undefined)

const { status, data } = await apiInstance.loadModelModelsModelNameLoadPost(
    modelName
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **modelName** | [**string**] |  | defaults to undefined|


### Return type

**LoadUnloadResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful Response |  -  |
|**422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **unloadModelModelsModelNameUnloadPost**
> LoadUnloadResponse unloadModelModelsModelNameUnloadPost()

Выгружает модель из памяти.

### Example

```typescript
import {
    ModelsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ModelsApi(configuration);

let modelName: string; // (default to undefined)

const { status, data } = await apiInstance.unloadModelModelsModelNameUnloadPost(
    modelName
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **modelName** | [**string**] |  | defaults to undefined|


### Return type

**LoadUnloadResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Successful Response |  -  |
|**422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

