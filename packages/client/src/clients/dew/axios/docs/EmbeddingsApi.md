# EmbeddingsApi

All URIs are relative to */api*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**embeddingsPost**](#embeddingspost) | **POST** /embeddings/ | |
|[**embeddingsQueryGet**](#embeddingsqueryget) | **GET** /embeddings/query | |
|[**embeddingsSessionIdGet**](#embeddingssessionidget) | **GET** /embeddings/session/{id} | |

# **embeddingsPost**
> EmbeddingsPost200Response embeddingsPost()


### Example

```typescript
import {
    EmbeddingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

let embeddingsSessionIdGet200ResponseInner: Array<EmbeddingsSessionIdGet200ResponseInner>; // (optional)

const { status, data } = await apiInstance.embeddingsPost(
    embeddingsSessionIdGet200ResponseInner
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **embeddingsSessionIdGet200ResponseInner** | **Array<EmbeddingsSessionIdGet200ResponseInner>**|  | |


### Return type

**EmbeddingsPost200Response**

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

# **embeddingsQueryGet**
> Array<EmbeddingsSessionIdGet200ResponseInner> embeddingsQueryGet()


### Example

```typescript
import {
    EmbeddingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

let updateat: string; // (optional) (default to undefined)
let modelname: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.embeddingsQueryGet(
    updateat,
    modelname
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **updateat** | [**string**] |  | (optional) defaults to undefined|
| **modelname** | [**string**] |  | (optional) defaults to undefined|


### Return type

**Array<EmbeddingsSessionIdGet200ResponseInner>**

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

# **embeddingsSessionIdGet**
> Array<EmbeddingsSessionIdGet200ResponseInner> embeddingsSessionIdGet()


### Example

```typescript
import {
    EmbeddingsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new EmbeddingsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.embeddingsSessionIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**Array<EmbeddingsSessionIdGet200ResponseInner>**

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

