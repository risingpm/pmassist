from backend.knowledge.prototypes import render_prototype_html
from backend import schemas


def test_render_prototype_html_generates_sections():
    spec = schemas.PrototypeSpec(
        title="Onboarding Flow",
        summary="Guides new users through account creation",
        goal="Activate new customers in under 3 minutes",
        success_metrics=["Complete onboarding", "Invite teammates"],
        key_screens=[
            schemas.PrototypeScreen(
                name="Welcome",
                goal="Introduce product value",
                primary_actions=["Start Signup"],
                layout_notes="Full-bleed illustration with CTA",
                components=[
                    schemas.PrototypeComponent(
                        kind="hero",
                        title="Meet your new AI PM",
                        description="Highlight the promise and quick start",
                        actions=["Start Signup"],
                    )
                ],
            ),
            schemas.PrototypeScreen(
                name="Profile Setup",
                goal="Capture essential profile details",
                primary_actions=["Save profile", "Skip"],
                components=[
                    schemas.PrototypeComponent(
                        kind="form",
                        title="Tell us about your team",
                        fields=["Team", "Role"],
                        actions=["Save profile"],
                    )
                ],
            ),
        ],
        user_flow=["Welcome", "Profile Setup", "Dashboard"],
        visual_style="Minimalist, soft gradients, plenty of whitespace",
        call_to_action="Start free trial",
    )

    html = render_prototype_html(spec)

    assert "Onboarding Flow" in html
    assert "Welcome" in html
    assert "Start Signup" in html
    assert "User Flow" in html
    assert "Start free trial" in html
