// response of https://openrouter.ai/api/v1/generation?id=gen-1771967930-1gsys6ZhRaY0TPbuRsDR
// {
//     "data": {
//         "created_at": "2026-02-24T21:19:33.705Z",
//         "model": "meta-llama/llama-4-scout-17b-16e-instruct",
//         "app_id": 2872617,
//         "external_user": null,
//         "streamed": true,
//         "cancelled": true,
//         "latency": 1016,
//         "moderation_latency": null,
//         "generation_time": 2940,
//         "tokens_prompt": 65,
//         "tokens_completion": 116,
//         "native_tokens_prompt": 64,
//         "native_tokens_completion": 98,
//         "native_tokens_completion_images": null,
//         "native_tokens_reasoning": 0,
//         "native_tokens_cached": 0,
//         "num_media_prompt": null,
//         "num_input_audio_prompt": null,
//         "num_media_completion": 0,
//         "num_search_results": null,
//         "origin": "https://github.com/wvanderp/Trick-question-bench",
//         "is_byok": false,
//         "finish_reason": null,
//         "native_finish_reason": null,
//         "usage": 0.00003452,
//         "router": null,
//         "provider_responses": [
//             {
//                 "endpoint_id": "9cf05ded-eefe-41b4-8c08-0c6460feffea",
//                 "id": "chatcmpl-RpyL88Ca8K6TiYlxBWgZcDml",
//                 "is_byok": false,
//                 "latency": 420,
//                 "model_permaslug": "meta-llama/llama-4-scout-17b-16e-instruct",
//                 "provider_name": "DeepInfra",
//                 "status": 200
//             }
//         ],
//         "api_type": "completions",
//         "id": "gen-1771967973-0hZ8J5kY7qLMOKbPx0u3",
//         "upstream_id": "chatcmpl-RpyL88Ca8K6TiYlxBWgZcDml",
//         "total_cost": 0.00003452,
//         "cache_discount": null,
//         "upstream_inference_cost": 0,
//         "provider_name": "DeepInfra"
//     }
// }
export type OpenRouterGenerationResponse = {
    data: {
        created_at: string;
        model: string;
        app_id: number;
        external_user: string | null;
        streamed: boolean;
        cancelled: boolean;
        latency: number;
        moderation_latency: number | null;
        generation_time: number;
        tokens_prompt: number;
        tokens_completion: number;
        native_tokens_prompt: number;
        native_tokens_completion: number;
        native_tokens_completion_images: number | null;
        native_tokens_reasoning: number;
        native_tokens_cached: number;
        num_media_prompt: number | null;
        num_input_audio_prompt: number | null;
        num_media_completion: number;
        num_search_results: number | null;
        origin: string;
        is_byok: boolean;
        finish_reason: string;
        native_finish_reason: string;
        usage: number;
        router: string | null;
        provider_responses: {
            endpoint_id: string;
            id: string;
            is_byok: boolean;
            latency: number;
            model_permaslug: string;
            provider_name: string;
            status: number;
        }[];
        api_type: string;
        id: string;
        upstream_id: string;
        // Cost in dollars
        total_cost: number;
        cache_discount: number | null;
        upstream_inference_cost: number;
        provider_name: string;
    };
};
