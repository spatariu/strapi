# Car Aggregator

An API that gathers used and new passenger-car adverts published on Romanian classifieds sites, so they can be searched in one place.

## Language

**Source**:
A classifieds site the aggregator gathers from. Currently OLX.ro and Publi24.ro.
_Avoid_: Provider, marketplace, platform

**Listing**:
One advert for a car as published by a seller on a single Source.
_Avoid_: Ad, advert, announcement, post

**Seller**:
The person or business that published a Listing, known only by the display name shown on the Source. No contact details are kept.
_Avoid_: Owner, advertiser, user

**Car**:
A used passenger car (autoturism) offered for sale in Romania. The only kind of vehicle in scope; new cars are excluded.
_Avoid_: Auto, automobile
