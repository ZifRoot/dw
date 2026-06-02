
# EmbeddingsIdGet200ResponseInner


## Properties

Name | Type
------------ | -------------
`modelName` | string
`embedding` | Array&lt;number&gt;
`dimension` | number
`processingTimeMs` | number
`sessionId` | string

## Example

```typescript
import type { EmbeddingsIdGet200ResponseInner } from ''

// TODO: Update the object below with actual values
const example = {
  "modelName": null,
  "embedding": null,
  "dimension": null,
  "processingTimeMs": null,
  "sessionId": null,
} satisfies EmbeddingsIdGet200ResponseInner

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as EmbeddingsIdGet200ResponseInner
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


