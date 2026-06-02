# DocumentsApi

All URIs are relative to */api*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**documentIdFragmentFragmentIdTextGet**](DocumentsApi.md#documentidfragmentfragmentidtextget) | **GET** /document/:id/fragment/:fragment_id/text |  |
| [**documentIdGet**](DocumentsApi.md#documentidget) | **GET** /document/:id |  |
| [**documentIdParseGet**](DocumentsApi.md#documentidparseget) | **GET** /document/:id/parse |  |
| [**documentIdTextGet**](DocumentsApi.md#documentidtextget) | **GET** /document/:id/text |  |
| [**documentsGet**](DocumentsApi.md#documentsget) | **GET** /documents |  |



## documentIdFragmentFragmentIdTextGet

> string documentIdFragmentFragmentIdTextGet(id, fragmentId)



### Example

```ts
import {
  Configuration,
  DocumentsApi,
} from '';
import type { DocumentIdFragmentFragmentIdTextGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DocumentsApi();

  const body = {
    // string
    id: id_example,
    // string
    fragmentId: msg_1_frag_2,
  } satisfies DocumentIdFragmentFragmentIdTextGetRequest;

  try {
    const data = await api.documentIdFragmentFragmentIdTextGet(body);
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
| **fragmentId** | `string` |  | [Defaults to `undefined`] |

### Return type

**string**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `text/plain`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Текст фрагмента |  -  |
| **400** | Неверный формат |  -  |
| **404** | Не найден |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## documentIdGet

> DocumentIdGet200Response documentIdGet(id)



### Example

```ts
import {
  Configuration,
  DocumentsApi,
} from '';
import type { DocumentIdGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DocumentsApi();

  const body = {
    // string
    id: session-123,
  } satisfies DocumentIdGetRequest;

  try {
    const data = await api.documentIdGet(body);
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

[**DocumentIdGet200Response**](DocumentIdGet200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Детали сессии |  -  |
| **404** | Не найдено |  -  |
| **500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## documentIdParseGet

> any documentIdParseGet(id)



### Example

```ts
import {
  Configuration,
  DocumentsApi,
} from '';
import type { DocumentIdParseGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DocumentsApi();

  const body = {
    // string
    id: session-123,
  } satisfies DocumentIdParseGetRequest;

  try {
    const data = await api.documentIdParseGet(body);
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

**any**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Результат парсинга |  -  |
| **404** | Не найдено |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## documentIdTextGet

> string documentIdTextGet(id)



### Example

```ts
import {
  Configuration,
  DocumentsApi,
} from '';
import type { DocumentIdTextGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DocumentsApi();

  const body = {
    // string
    id: session-123,
  } satisfies DocumentIdTextGetRequest;

  try {
    const data = await api.documentIdTextGet(body);
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

**string**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `text/plain`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Полный текст |  -  |
| **404** | Не найдено |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## documentsGet

> Array&lt;DocumentsGet200ResponseInner&gt; documentsGet()



### Example

```ts
import {
  Configuration,
  DocumentsApi,
} from '';
import type { DocumentsGetRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new DocumentsApi();

  try {
    const data = await api.documentsGet();
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

[**Array&lt;DocumentsGet200ResponseInner&gt;**](DocumentsGet200ResponseInner.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Список сессий |  -  |
| **500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

