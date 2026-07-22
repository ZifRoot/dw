# ActionsApi

All URIs are relative to */api*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**actionsUpdateEmbeddingPost**](#actionsupdateembeddingpost) | **POST** /actions/update-embedding | |
|[**actionsUpdatePost**](#actionsupdatepost) | **POST** /actions/update | |

# **actionsUpdateEmbeddingPost**
> any actionsUpdateEmbeddingPost()


### Example

```typescript
import {
    ActionsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ActionsApi(configuration);

const { status, data } = await apiInstance.actionsUpdateEmbeddingPost();
```

### Parameters
This endpoint does not have any parameters.


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

# **actionsUpdatePost**
> any actionsUpdatePost()


### Example

```typescript
import {
    ActionsApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new ActionsApi(configuration);

const { status, data } = await apiInstance.actionsUpdatePost();
```

### Parameters
This endpoint does not have any parameters.


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

