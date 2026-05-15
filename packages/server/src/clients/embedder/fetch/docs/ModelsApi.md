# ModelsApi

All URIs are relative to *http://localhost*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getModelsModelsGet**](ModelsApi.md#getmodelsmodelsget) | **GET** /models | Get Models |
| [**loadModelModelsModelNameLoadPost**](ModelsApi.md#loadmodelmodelsmodelnameloadpost) | **POST** /models/{model_name}/load | Load Model |
| [**unloadModelModelsModelNameUnloadPost**](ModelsApi.md#unloadmodelmodelsmodelnameunloadpost) | **POST** /models/{model_name}/unload | Unload Model |



## getModelsModelsGet

> ModelsListResponse getModelsModelsGet()

Get Models

Список моделей с их статусами.

### Example

```ts
import {
  Configuration,
  ModelsApi,
} from '';
import type { GetModelsModelsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ModelsApi();

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


## loadModelModelsModelNameLoadPost

> LoadUnloadResponse loadModelModelsModelNameLoadPost(modelName)

Load Model

Загружает модель в память GPU.

### Example

```ts
import {
  Configuration,
  ModelsApi,
} from '';
import type { LoadModelModelsModelNameLoadPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ModelsApi();

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
  ModelsApi,
} from '';
import type { UnloadModelModelsModelNameUnloadPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ModelsApi();

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

