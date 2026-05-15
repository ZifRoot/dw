# DefaultApi

All URIs are relative to *http://localhost*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createTaskEmbeddingsPost**](#createtaskembeddingspost) | **POST** /embeddings | Create Task|
|[**deleteTaskEmbeddingsTaskIdDelete**](#deletetaskembeddingstaskiddelete) | **DELETE** /embeddings/{task_id} | Delete Task|
|[**getModelsModelsGet**](#getmodelsmodelsget) | **GET** /models | Get Models|
|[**getTaskEmbeddingsTaskIdGet**](#gettaskembeddingstaskidget) | **GET** /embeddings/{task_id} | Get Task|
|[**listTasksEmbeddingsGet**](#listtasksembeddingsget) | **GET** /embeddings | List Tasks|
|[**loadModelModelsModelNameLoadPost**](#loadmodelmodelsmodelnameloadpost) | **POST** /models/{model_name}/load | Load Model|
|[**unloadModelModelsModelNameUnloadPost**](#unloadmodelmodelsmodelnameunloadpost) | **POST** /models/{model_name}/unload | Unload Model|

# **createTaskEmbeddingsPost**
> TaskShortResponse createTaskEmbeddingsPost(computeRequest)

Создаёт задачу на вычисление эмбеддинга.

### Example

```typescript
import {
    DefaultApi,
    Configuration,
    ComputeRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let computeRequest: ComputeRequest; //

const { status, data } = await apiInstance.createTaskEmbeddingsPost(
    computeRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **computeRequest** | **ComputeRequest**|  | |


### Return type

**TaskShortResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**202** | Successful Response |  -  |
|**422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteTaskEmbeddingsTaskIdDelete**
> deleteTaskEmbeddingsTaskIdDelete()

Удаление задачи (только из памяти).

### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let taskId: string; // (default to undefined)

const { status, data } = await apiInstance.deleteTaskEmbeddingsTaskIdDelete(
    taskId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **taskId** | [**string**] |  | defaults to undefined|


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**204** | Successful Response |  -  |
|**422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getModelsModelsGet**
> ModelsListResponse getModelsModelsGet()

Список моделей с их статусами.

### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

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

# **getTaskEmbeddingsTaskIdGet**
> TaskDetailResponse getTaskEmbeddingsTaskIdGet()

Получение информации о задаче.

### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let taskId: string; // (default to undefined)

const { status, data } = await apiInstance.getTaskEmbeddingsTaskIdGet(
    taskId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **taskId** | [**string**] |  | defaults to undefined|


### Return type

**TaskDetailResponse**

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

# **listTasksEmbeddingsGet**
> TasksListResponse listTasksEmbeddingsGet()

Список всех задач (опционально фильтр по статусу).

### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let status: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.listTasksEmbeddingsGet(
    status
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **status** | [**string**] |  | (optional) defaults to undefined|


### Return type

**TasksListResponse**

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

# **loadModelModelsModelNameLoadPost**
> LoadUnloadResponse loadModelModelsModelNameLoadPost()

Загружает модель в память GPU.

### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

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
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

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

