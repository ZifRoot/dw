# EmbeddingsApi

All URIs are relative to */api*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**embeddingsIdGet**](#embeddingsidget) | **GET** /embeddings/:id | |
|[**embeddingsIdPost**](#embeddingsidpost) | **POST** /embeddings/:id | |

# **embeddingsIdGet**
> Array<any | null> embeddingsIdGet()


### Example

```typescript
import {
    EmbeddingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.embeddingsIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**Array<any | null>**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Список эмбеддингов |  -  |
|**500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **embeddingsIdPost**
> EmbeddingsIdPost200Response embeddingsIdPost()


### Example

```typescript
import {
    EmbeddingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

let id: string; // (default to undefined)
let embeddingsIdPostRequestInner: Array<EmbeddingsIdPostRequestInner>; // (optional)

const { status, data } = await apiInstance.embeddingsIdPost(
    id,
    embeddingsIdPostRequestInner
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **embeddingsIdPostRequestInner** | **Array<EmbeddingsIdPostRequestInner>**|  | |
| **id** | [**string**] |  | defaults to undefined|


### Return type

**EmbeddingsIdPost200Response**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Сохранено |  -  |
|**400** | Неверный запрос |  -  |
|**404** | Сессия не найдена |  -  |
|**500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

