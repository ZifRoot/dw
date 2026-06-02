# ActionsApi

All URIs are relative to */api*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**actionsUpdateEmbeddingPost**](ActionsApi.md#actionsupdateembeddingpost) | **POST** /actions/update-embedding |  |
| [**actionsUpdatePost**](ActionsApi.md#actionsupdatepost) | **POST** /actions/update |  |



## actionsUpdateEmbeddingPost

> any actionsUpdateEmbeddingPost()



### Example

```ts
import {
  Configuration,
  ActionsApi,
} from '';
import type { ActionsUpdateEmbeddingPostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ActionsApi();

  try {
    const data = await api.actionsUpdateEmbeddingPost();
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


## actionsUpdatePost

> any actionsUpdatePost()



### Example

```ts
import {
  Configuration,
  ActionsApi,
} from '';
import type { ActionsUpdatePostRequest } from '';

async function example() {
  console.log("🚀 Testing  SDK...");
  const api = new ActionsApi();

  try {
    const data = await api.actionsUpdatePost();
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

