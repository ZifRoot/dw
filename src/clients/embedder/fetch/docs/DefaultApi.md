# DefaultApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createTaskEmbeddingsPost**](DefaultApi.md#createtaskembeddingspost) | **POST** /embeddings | Create Task |
| [**deleteTaskEmbeddingsTaskIdDelete**](DefaultApi.md#deletetaskembeddingstaskiddelete) | **DELETE** /embeddings/{task_id} | Delete Task |
| [**getModelsModelsGet**](DefaultApi.md#getmodelsmodelsget) | **GET** /models | Get Models |
| [**getTaskEmbeddingsTaskIdGet**](DefaultApi.md#gettaskembeddingstaskidget) | **GET** /embeddings/{task_id} | Get Task |
| [**listTasksEmbeddingsGet**](DefaultApi.md#listtasksembeddingsget) | **GET** /embeddings | List Tasks |
| [**loadModelModelsModelNameLoadPost**](DefaultApi.md#loadmodelmodelsmodelnameloadpost) | **POST** /models/{model_name}/load | Load Model |
| [**unloadModelModelsModelNameUnloadPost**](DefaultApi.md#unloadmodelmodelsmodelnameunloadpost) | **POST** /models/{model_name}/unload | Unload Model |



## createTaskEmbeddingsPost

> TaskShortResponse createTaskEmbeddingsPost(computeRequest)

Create Task

Создаёт задачу на вычисление эмбеддинга.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { CreateTaskEmbeddingsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

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
  DefaultApi,
} from '';
import type { DeleteTaskEmbeddingsTaskIdDeleteRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

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


## getModelsModelsGet

> ModelsListResponse getModelsModelsGet()

Get Models

Список моделей с их статусами.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetModelsModelsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  try {
    const data = await api.getModelsModelsGet();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**ModelsListResponse**](ModelsListResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Successful Response |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getTaskEmbeddingsTaskIdGet

> TaskDetailResponse getTaskEmbeddingsTaskIdGet(taskId)

Get Task

Получение информации о задаче.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { GetTaskEmbeddingsTaskIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

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

> TasksListResponse listTasksEmbeddingsGet(status)

List Tasks

Список всех задач (опционально фильтр по статусу).

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { ListTasksEmbeddingsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string (optional)
    status: status_example,
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
| **status** | `string` |  | [Optional] [Defaults to `undefined`] |

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


## loadModelModelsModelNameLoadPost

> LoadUnloadResponse loadModelModelsModelNameLoadPost(modelName)

Load Model

Загружает модель в память GPU.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { LoadModelModelsModelNameLoadPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    modelName: modelName_example,
  } satisfies LoadModelModelsModelNameLoadPostRequest;

  try {
    const data = await api.loadModelModelsModelNameLoadPost(body);
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
| **modelName** | `string` |  | [Defaults to `undefined`] |

### Return type

[**LoadUnloadResponse**](LoadUnloadResponse.md)

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


## unloadModelModelsModelNameUnloadPost

> LoadUnloadResponse unloadModelModelsModelNameUnloadPost(modelName)

Unload Model

Выгружает модель из памяти.

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '';
import type { UnloadModelModelsModelNameUnloadPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DefaultApi();

  const body = {
    // string
    modelName: modelName_example,
  } satisfies UnloadModelModelsModelNameUnloadPostRequest;

  try {
    const data = await api.unloadModelModelsModelNameUnloadPost(body);
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
| **modelName** | `string` |  | [Defaults to `undefined`] |

### Return type

[**LoadUnloadResponse**](LoadUnloadResponse.md)

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

