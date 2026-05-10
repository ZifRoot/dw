# EmbeddingsApi

All URIs are relative to *http://localhost*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**createTaskEmbeddingsPost**](#createtaskembeddingspost) | **POST** /embeddings | Create Task|
|[**deleteTaskEmbeddingsTaskIdDelete**](#deletetaskembeddingstaskiddelete) | **DELETE** /embeddings/{task_id} | Delete Task|
|[**getTaskEmbeddingsTaskIdGet**](#gettaskembeddingstaskidget) | **GET** /embeddings/{task_id} | Get Task|
|[**listTasksEmbeddingsGet**](#listtasksembeddingsget) | **GET** /embeddings | List Tasks|

# **createTaskEmbeddingsPost**
> TaskShortResponse createTaskEmbeddingsPost(computeRequest)

Создаёт задачу на вычисление эмбеддинга.

### Example

```typescript
import {
    EmbeddingsApi,
    Configuration,
    ComputeRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

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

Удаляет задачу (только незавершённые и не выполняющиеся).

### Example

```typescript
import {
    EmbeddingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

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

# **getTaskEmbeddingsTaskIdGet**
> TaskDetailResponse getTaskEmbeddingsTaskIdGet()

Получение информации о задаче.

### Example

```typescript
import {
    EmbeddingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

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


### Example

```typescript
import {
    EmbeddingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

let statusFilter: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.listTasksEmbeddingsGet(
    statusFilter
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **statusFilter** | [**string**] |  | (optional) defaults to undefined|


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

