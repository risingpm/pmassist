import pytest

from backend.knowledge.prototype_agent import _normalise_spec_payload
from backend import schemas


@pytest.mark.parametrize(
    "raw,assistant_message",
    [
        (
            {
                "key_screens": [
                    {
                        "name": "Metrics Page",
                        "goal": "Showcase the experience.",
                        "components": [],
                    }
                ]
            },
            (
                "I've updated the metrics webpage to include specific metrics aligned with our project goals and description.\n"
                "1. **Total Certified Product Managers**: Number of users who have successfully completed all required courses.\n"
                "2. **Course Completion Rate**: Percentage of users who complete the courses they enroll in.\n"
                "3. **Average Time to Certification**: Average time taken by users to complete the entire series." 
            ),
        ),
        (
            {
                "main_page": {
                    "title": "Courses",
                    "description": "List courses",
                    "sections": [
                        {
                            "type": "hero",
                            "title": "Courses hero",
                            "primaryActions": ["Browse"],
                        }
                    ],
                }
            },
            None,
        ),
    ],
)
def test_normalise_spec_payload_generates_screens(raw, assistant_message):
    payload = _normalise_spec_payload(
        raw,
        default_title="Sample Project · Concept prototype",
        default_summary="Interactive exploration",
        default_goal="Help users succeed",
        focus_hint="Metrics",
        assistant_notes=assistant_message,
    )

    assert payload is not None
    spec = schemas.PrototypeSpec(**payload)
    assert spec.key_screens, "Key screens should not be empty"
    if assistant_message:
        metrics_screen = next((screen for screen in spec.key_screens if "metric" in screen.name.lower()), spec.key_screens[0])
        list_components = [component for component in metrics_screen.components if component.kind == "list"]
        assert list_components, "Expected list component populated from assistant notes"
        assert len(list_components[0].sample_items or []) >= 3
    else:
        screens_with_components = [screen for screen in spec.key_screens if screen.components]
        assert screens_with_components, "Expected components synthesised from page sections"
