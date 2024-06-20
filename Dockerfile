FROM  node

RUN mkdir -p /home \
    && cd home \
    && git clone https://github.com/TypeFox/open-collaboration-tools.git app \
    && cd app \
    && npm i \
    && npm run build

EXPOSE 8100
WORKDIR /home/app
CMD [ "bash", "-c", "npm run start" ]
