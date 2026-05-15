# TaskDetailResponse


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**task_id** | **string** |  | [default to undefined]
**model_name** | **string** |  | [default to undefined]
**status** | **string** |  | [default to undefined]
**result** | **Array&lt;number&gt;** |  | [optional] [default to undefined]
**error** | **string** |  | [optional] [default to undefined]
**processing_time_ms** | **number** |  | [optional] [default to undefined]
**created_at** | **string** |  | [default to undefined]
**completed_at** | **string** |  | [optional] [default to undefined]

## Example

```typescript
import { TaskDetailResponse } from './api';

const instance: TaskDetailResponse = {
    task_id,
    model_name,
    status,
    result,
    error,
    processing_time_ms,
    created_at,
    completed_at,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
