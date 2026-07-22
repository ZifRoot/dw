# EmbeddingsApi

All URIs are relative to */api*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**embeddingsPost**](EmbeddingsApi.md#embeddingspost) | **POST** /embeddings/ |  |
| [**embeddingsQueryGet**](EmbeddingsApi.md#embeddingsqueryget) | **GET** /embeddings/query |  |
| [**embeddingsSessionIdGet**](EmbeddingsApi.md#embeddingssessionidget) | **GET** /embeddings/session/{id} |  |



## embeddingsPost

> EmbeddingsPost200Response embeddingsPost(embeddingsSessionIdGet200ResponseInner)



### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { EmbeddingsPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // Array<EmbeddingsSessionIdGet200ResponseInner> (optional)
    embeddingsSessionIdGet200ResponseInner: ...,
  } satisfies EmbeddingsPostRequest;

  try {
    const data = await api.embeddingsPost(body);
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
| **embeddingsSessionIdGet200ResponseInner** | `Array<EmbeddingsSessionIdGet200ResponseInner>` |  | [Optional] |

### Return type

[**EmbeddingsPost200Response**](EmbeddingsPost200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Сохранено |  -  |
| **400** | Неверный запрос |  -  |
| **404** | Сессия не найдена |  -  |
| **500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## embeddingsQueryGet

> Array&lt;EmbeddingsSessionIdGet200ResponseInner&gt; embeddingsQueryGet(updateat, modelname)



### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { EmbeddingsQueryGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // Date (optional)
    updateat: 2026-07-21T08:31:33.084Z,
    // string (optional)
    modelname: model name,
  } satisfies EmbeddingsQueryGetRequest;

  try {
    const data = await api.embeddingsQueryGet(body);
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
| **updateat** | `Date` |  | [Optional] [Defaults to `undefined`] |
| **modelname** | `string` |  | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;EmbeddingsSessionIdGet200ResponseInner&gt;**](EmbeddingsSessionIdGet200ResponseInner.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Список эмбеддингов |  -  |
| **500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## embeddingsSessionIdGet

> Array&lt;EmbeddingsSessionIdGet200ResponseInner&gt; embeddingsSessionIdGet(id)



### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { EmbeddingsSessionIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // string
    id: session-123,
  } satisfies EmbeddingsSessionIdGetRequest;

  try {
    const data = await api.embeddingsSessionIdGet(body);
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
| **id** | `string` |  | [Defaults to `undefined`] |

### Return type

[**Array&lt;EmbeddingsSessionIdGet200ResponseInner&gt;**](EmbeddingsSessionIdGet200ResponseInner.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Список эмбеддингов |  -  |
| **500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

