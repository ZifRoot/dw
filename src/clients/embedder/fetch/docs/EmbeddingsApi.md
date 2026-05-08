# EmbeddingsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createTaskEmbeddingsPost**](EmbeddingsApi.md#createtaskembeddingspost) | **POST** /embeddings | Create Task |
| [**deleteTaskEmbeddingsTaskIdDelete**](EmbeddingsApi.md#deletetaskembeddingstaskiddelete) | **DELETE** /embeddings/{task_id} | Delete Task |
| [**getTaskEmbeddingsTaskIdGet**](EmbeddingsApi.md#gettaskembeddingstaskidget) | **GET** /embeddings/{task_id} | Get Task |
| [**listTasksEmbeddingsGet**](EmbeddingsApi.md#listtasksembeddingsget) | **GET** /embeddings | List Tasks |



## createTaskEmbeddingsPost

> TaskShortResponse createTaskEmbeddingsPost(computeRequest)

Create Task

Создаёт задачу на вычисление эмбеддинга.

### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { CreateTaskEmbeddingsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // ComputeRequest
    computeRequest: ...,
  } satisfies CreateTaskEmbeddingsPostRequest;

  try {
    const data = await api.createTaskEmbeddingsPost(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **computeRequest** | [ComputeRequest](ComputeRequest.md) |  | |

### Return type

[**TaskShortResponse**](TaskShortResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **202** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteTaskEmbeddingsTaskIdDelete

> deleteTaskEmbeddingsTaskIdDelete(taskId)

Delete Task

Удаление задачи (только из памяти).

### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { DeleteTaskEmbeddingsTaskIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // string
    taskId: taskId_example,
  } satisfies DeleteTaskEmbeddingsTaskIdDeleteRequest;

  try {
    const data = await api.deleteTaskEmbeddingsTaskIdDelete(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **taskId** | `string` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getTaskEmbeddingsTaskIdGet

> TaskDetailResponse getTaskEmbeddingsTaskIdGet(taskId)

Get Task

Получение информации о задаче.

### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { GetTaskEmbeddingsTaskIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // string
    taskId: taskId_example,
  } satisfies GetTaskEmbeddingsTaskIdGetRequest;

  try {
    const data = await api.getTaskEmbeddingsTaskIdGet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **taskId** | `string` |  | [Defaults to `undefined`] |

### Return type

[**TaskDetailResponse**](TaskDetailResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listTasksEmbeddingsGet

> TasksListResponse listTasksEmbeddingsGet(statusFilter)

List Tasks

### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { ListTasksEmbeddingsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // string (optional)
    statusFilter: statusFilter_example,
  } satisfies ListTasksEmbeddingsGetRequest;

  try {
    const data = await api.listTasksEmbeddingsGet(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **statusFilter** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**TasksListResponse**](TasksListResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |
| **422** | Validation Error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

