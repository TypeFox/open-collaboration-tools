FROM  node

COPY . /home/app
RUN cd /home/app && npm i

EXPOSE 8100
ENV JWT_PRIVATE_KEY=secret
WORKDIR /home/app
CMD [ "bash", "-c", "npm run start" ]
