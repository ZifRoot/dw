# EmbeddingsApi

All URIs are relative to */api*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**embeddingsIdGet**](EmbeddingsApi.md#embeddingsidget) | **GET** /embeddings/:id |  |
| [**embeddingsIdPost**](EmbeddingsApi.md#embeddingsidpost) | **POST** /embeddings/:id |  |



## embeddingsIdGet

> Array&lt;EmbeddingsIdGet200ResponseInner&gt; embeddingsIdGet(id)



### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { EmbeddingsIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // string
    id: session-123,
  } satisfies EmbeddingsIdGetRequest;

  try {
    const data = await api.embeddingsIdGet(body);
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

[**Array&lt;EmbeddingsIdGet200ResponseInner&gt;**](EmbeddingsIdGet200ResponseInner.md)

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


## embeddingsIdPost

> EmbeddingsIdPost200Response embeddingsIdPost(id, embeddingsIdGet200ResponseInner)



### Example

```ts
import {
  Configuration,
  EmbeddingsApi,
} from '';
import type { EmbeddingsIdPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new EmbeddingsApi();

  const body = {
    // string
    id: session-123,
    // Array<EmbeddingsIdGet200ResponseInner> (optional)
    embeddingsIdGet200ResponseInner: ...,
  } satisfies EmbeddingsIdPostRequest;

  try {
    const data = await api.embeddingsIdPost(body);
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
| **embeddingsIdGet200ResponseInner** | `Array<EmbeddingsIdGet200ResponseInner>` |  | [Optional] |

### Return type

[**EmbeddingsIdPost200Response**](EmbeddingsIdPost200Response.md)

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

