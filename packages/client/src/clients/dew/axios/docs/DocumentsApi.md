# DocumentsApi

All URIs are relative to */api*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**documentIdFragmentFragmentIdTextGet**](#documentidfragmentfragmentidtextget) | **GET** /document/:id/fragment/:fragment_id/text | |
|[**documentIdGet**](#documentidget) | **GET** /document/:id | |
|[**documentIdParseGet**](#documentidparseget) | **GET** /document/:id/parse | |
|[**documentIdTextGet**](#documentidtextget) | **GET** /document/:id/text | |
|[**documentsGet**](#documentsget) | **GET** /documents | |

# **documentIdFragmentFragmentIdTextGet**
> string documentIdFragmentFragmentIdTextGet()


### Example

```typescript
import {
    DocumentsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DocumentsApi(configuration);

let id: string; // (default to undefined)
let fragmentId: string; // (default to undefined)

const { status, data } = await apiInstance.documentIdFragmentFragmentIdTextGet(
    id,
    fragmentId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|
| **fragmentId** | [**string**] |  | defaults to undefined|


### Return type

**string**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: text/plain


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Текст фрагмента |  -  |
|**400** | Неверный формат |  -  |
|**404** | Не найден |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **documentIdGet**
> DocumentIdGet200Response documentIdGet()


### Example

```typescript
import {
    DocumentsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DocumentsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.documentIdGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**DocumentIdGet200Response**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Детали сессии |  -  |
|**404** | Не найдено |  -  |
|**500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **documentIdParseGet**
> any documentIdParseGet()


### Example

```typescript
import {
    DocumentsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DocumentsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.documentIdParseGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**any**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Результат парсинга |  -  |
|**404** | Не найдено |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **documentIdTextGet**
> string documentIdTextGet()


### Example

```typescript
import {
    DocumentsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DocumentsApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.documentIdTextGet(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**string**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: text/plain


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Полный текст |  -  |
|**404** | Не найдено |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **documentsGet**
> Array<DocumentsGet200ResponseInner> documentsGet()


### Example

```typescript
import {
    DocumentsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DocumentsApi(configuration);

const { status, data } = await apiInstance.documentsGet();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Array<DocumentsGet200ResponseInner>**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Список сессий |  -  |
|**500** | Ошибка |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

