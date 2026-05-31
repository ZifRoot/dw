
# TaskDetailResponse


## Properties

Name | Type
------------ | -------------
`taskId` | string
`modelName` | string
`status` | string
`result` | Array&lt;number&gt;
`error` | string
`processingTimeMs` | number
`createdAt` | string
`completedAt` | string

## Example

```typescript
import type { TaskDetailResponse } from ''

// TODO: Update the object below with actual values
const example = {
  "taskId": null,
  "modelName": null,
  "status": null,
  "result": null,
  "error": null,
  "processingTimeMs": null,
  "createdAt": null,
  "completedAt": null,
} satisfies TaskDetailResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TaskDetailResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


