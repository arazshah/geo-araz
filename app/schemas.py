from pydantic import BaseModel, Field, field_validator


class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class ReverseGeocodeRequest(Coordinate):
    pass


class SearchRequest(BaseModel):
    text: str = Field(min_length=2, max_length=200)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        value = " ".join(value.split())

        if len(value) < 2:
            raise ValueError("عبارت جست‌وجو بسیار کوتاه است.")

        return value


class RouteRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate
